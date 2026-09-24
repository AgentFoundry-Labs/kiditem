import { aiUsageMeter } from '../../../application/usage/ai-usage-meter';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { KiditemExternalError, KiditemInvalidValueError } from '@kiditem/shared/errors';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  buildColorGuideImageEditPrompt,
  buildImageEditPrompt,
} from '../../../domain/image-edit-prompts';
import {
  MAX_FETCH_BYTES,
  parseDataImageUrl,
} from '../../../domain/thumbnail-image-source';
import {
  IMAGE_EDIT_MEDIA_PORT,
  type ImageEditMediaCommand,
  type ImageEditMediaPort,
  type ImageEditMediaResult,
} from '../../../application/port/out/provider/image-edit-media.port';
import {
  IMAGE_FETCH_PORT,
  type ImageFetchPort,
} from '../../../application/port/out/provider/image-fetch.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../../../application/port/out/storage/image-storage.port';
import { requireGeminiApiKey } from './thumbnail-gemini-config';

interface InlineImagePart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

type GeminiPart = InlineImagePart | { text: string };

const PROVIDER_TIMEOUT_MS = 120_000;

@Injectable()
export class ImageEditGeminiMediaAdapter implements ImageEditMediaPort {
  private readonly logger = new Logger(ImageEditGeminiMediaAdapter.name);
  private client: GoogleGenAI | null = null;

  constructor(
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
  ) {}

  async editImage(command: ImageEditMediaCommand): Promise<ImageEditMediaResult> {
    command.signal?.throwIfAborted();
    if (!command.model) {
      throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', { details: { reason: 'IMAGE_EDIT_MODEL_MISSING' } });
    }

    const preset = command.preset || 'custom';
    const parts = preset === 'color_guide'
      ? await this.buildColorGuideParts(command)
      : await this.buildSingleImageParts(command);

    const response = await this.getClient().models.generateContent({
      model: command.model,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        abortSignal: command.signal,
        httpOptions: { timeout: PROVIDER_TIMEOUT_MS },
      },
    });
    aiUsageMeter.recordGemini({ model: command.model, operation: 'image_edit', usage: response.usageMetadata });

    const inlineData = response.candidates?.[0]?.content?.parts
      ?.find((part) => part.inlineData?.data)
      ?.inlineData;
    if (!inlineData?.data) {
      const text = response.candidates?.[0]?.content?.parts
        ?.find((part) => part.text)
        ?.text
        ?.slice(0, 300);
      this.logger.warn(`Gemini image_edit response had no inline image. text=${text ?? '(empty)'}`);
      throw new KiditemExternalError('CONTENT_GENERATION_FAILED', { details: { reason: 'IMAGE_EDIT_RETURNED_NO_IMAGE' } });
    }

    return {
      buffer: Buffer.from(inlineData.data, 'base64'),
      mimeType: inlineData.mimeType ?? 'image/png',
    };
  }

  private async buildSingleImageParts(command: ImageEditMediaCommand): Promise<GeminiPart[]> {
    if (!command.imageUrl) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'IMAGE_URL_REQUIRED' }, message: '편집할 이미지를 골라 주세요.' });
    }
    const image = await this.resolveInlineImage(command.imageUrl, command.signal);
    return [
      image,
      {
        text: buildImageEditPrompt({
          preset: command.preset,
          userPrompt: command.userPrompt,
        }),
      },
    ];
  }

  private async buildColorGuideParts(command: ImageEditMediaCommand): Promise<GeminiPart[]> {
    const imageUrls = command.imageUrls ?? [];
    if (imageUrls.length < 2) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'COLOR_GUIDE_IMAGES_REQUIRED' }, message: '색상 안내를 만들려면 이미지를 두 장 이상 골라 주세요.' });
    }
    const images = await Promise.all(
      imageUrls.map((imageUrl) => this.resolveInlineImage(imageUrl, command.signal)),
    );
    return [
      ...images,
      { text: buildColorGuideImageEditPrompt() },
    ];
  }

  private async resolveInlineImage(source: string, signal?: AbortSignal): Promise<InlineImagePart> {
    signal?.throwIfAborted();
    const dataImage = parseDataImageUrl(source);
    if (dataImage) {
      const mimeType = dataImage.mimeType.toLowerCase();
      this.imageFetcher.assertSupportedMime(mimeType);
      const buffer = Buffer.from(dataImage.base64, 'base64');
      if (buffer.length > MAX_FETCH_BYTES) {
        throw new KiditemInvalidValueError('CONTENT_IMAGE_TOO_LARGE');
      }
      return {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType,
        },
      };
    }

    const ownKey = this.storage.extractKey(source);
    const fetched = ownKey
      ? await this.imageFetcher.fetchTrustedStorageImage(source, { signal })
      : await this.imageFetcher.fetchImage(source, { signal });
    return {
      inlineData: {
        data: fetched.buffer.toString('base64'),
        mimeType: fetched.mimeType,
      },
    };
  }

  private getClient(): GoogleGenAI {
    if (!this.client) this.client = new GoogleGenAI({ apiKey: requireGeminiApiKey() });
    return this.client;
  }
}

export const IMAGE_EDIT_MEDIA_ADAPTER_PROVIDER = {
  provide: IMAGE_EDIT_MEDIA_PORT,
  useExisting: ImageEditGeminiMediaAdapter,
};
