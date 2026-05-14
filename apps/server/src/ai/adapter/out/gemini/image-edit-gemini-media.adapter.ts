import { randomUUID } from 'node:crypto';
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
} from '../../../application/port/out/image-edit-media.port';
import {
  IMAGE_FETCH_PORT,
  type ImageFetchPort,
} from '../../../application/port/out/image-fetch.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../../../application/port/out/image-storage.port';
import { requireGeminiApiKey } from './thumbnail-gemini-config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');

interface InlineImagePart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

type GeminiPart = InlineImagePart | { text: string };

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

    const responseMimeType = inlineData.mimeType ?? 'image/png';
    this.imageFetcher.assertSupportedMime(responseMimeType);
    const normalized = await this.normalizeOutputImage(
      Buffer.from(inlineData.data, 'base64'),
      responseMimeType,
      preset,
    );
    const storageKey = this.outputStorageKey(command.organizationId, preset, normalized.mimeType);
    const imageUrl = await this.storage.save(storageKey, normalized.buffer, normalized.mimeType);

    return {
      imageUrl,
      storageKey,
      mimeType: normalized.mimeType,
      fileSize: normalized.buffer.length,
    };
  }

  private async buildSingleImageParts(command: ImageEditMediaCommand): Promise<GeminiPart[]> {
    if (!command.imageUrl) {
      throw new BadRequestException('image_url is required');
    }
    const image = await this.resolveInlineImage(command.imageUrl);
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
      imageUrls.map((imageUrl) => this.resolveInlineImage(imageUrl)),
    );
    return [
      ...images,
      { text: buildColorGuideImageEditPrompt() },
    ];
  }

  private async resolveInlineImage(source: string): Promise<InlineImagePart> {
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
      ? await this.imageFetcher.fetchTrustedStorageImage(source)
      : await this.imageFetcher.fetchImage(source);
    return {
      inlineData: {
        data: fetched.buffer.toString('base64'),
        mimeType: fetched.mimeType,
      },
    };
  }

  private outputStorageKey(
    organizationId: string,
    preset: string,
    mimeType: string,
  ): string {
    const safePreset = preset.replace(/[^a-z0-9_-]/gi, '_') || 'custom';
    return `tmp/image-edits/${organizationId}/${safePreset}-${randomUUID()}.${this.imageFetcher.extForMime(mimeType)}`;
  }

  private async normalizeOutputImage(
    buffer: Buffer,
    mimeType: string,
    preset: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    if (preset !== 'remove_background') return { buffer, mimeType };

    try {
      return {
        buffer: await sharp(buffer)
          .flatten({ background: '#FFFFFF' })
          .png()
          .toBuffer(),
        mimeType: 'image/png',
      };
    } catch (error) {
      this.logger.warn(`Failed to flatten remove_background output: ${error instanceof Error ? error.message : String(error)}`);
      return { buffer, mimeType };
    }
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
