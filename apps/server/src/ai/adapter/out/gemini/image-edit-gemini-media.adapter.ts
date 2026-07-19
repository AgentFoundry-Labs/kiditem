import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
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
      throw new ServiceUnavailableException('image_edit_model_not_configured');
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

    const inlineData = response.candidates?.[0]?.content?.parts
      ?.find((part) => part.inlineData?.data)
      ?.inlineData;
    if (!inlineData?.data) {
      const text = response.candidates?.[0]?.content?.parts
        ?.find((part) => part.text)
        ?.text
        ?.slice(0, 300);
      this.logger.warn(`Gemini image_edit response had no inline image. text=${text ?? '(empty)'}`);
      throw new ServiceUnavailableException('image_edit_returned_no_image');
    }

    return {
      buffer: Buffer.from(inlineData.data, 'base64'),
      mimeType: inlineData.mimeType ?? 'image/png',
    };
  }

  private async buildSingleImageParts(command: ImageEditMediaCommand): Promise<GeminiPart[]> {
    if (!command.imageUrl) {
      throw new BadRequestException('image_url is required');
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
      throw new BadRequestException('color_guide requires at least two image URLs');
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
        throw new BadRequestException('image too large');
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
