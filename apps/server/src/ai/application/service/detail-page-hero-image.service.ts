import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { isSafetyLabelImageUrl } from '../../domain/detail-page-image-order';
import {
  buildColorGuidePrompt,
  buildColorImageSelectionPrompt,
  buildColorSubtitlePrompt,
  buildDetailCutPrompt,
  buildHeroBannerPrompt,
  buildHeroProductImagePrompt,
  buildPackageGuidePrompt,
  buildPackageImagePositionsPrompt,
  buildSizeGuidePrompt,
  buildUsageGuidePrompt,
} from '../../domain/detail-page-media-prompts';
import type { DetailPageAgeGroup } from '../../domain/prompts/detail-page/types';
import {
  DETAIL_PAGE_MEDIA_PORT,
  type DetailPageMediaPort,
} from '../port/out/detail-page-media.port';
import { IMAGE_FETCH_PORT, type ImageFetchPort } from '../port/out/image-fetch.port';
import { IMAGE_STORAGE_PORT, type ImageStoragePort } from '../port/out/image-storage.port';

const sharp: typeof import('sharp') = require('sharp');

interface GenerateHeroBannerInput {
  organizationId: string;
  productName: string;
  category: string;
  description: string;
  options: string;
  templateId: 'kids-playful' | 'bold-vertical';
  ageGroup?: DetailPageAgeGroup;
  headline: string;
  subhead: string;
  imageUrls: string[];
}

interface GenerateSizeGuideImageInput {
  organizationId: string;
  productName: string;
  category: string;
  description: string;
  options: string;
  ageGroup?: DetailPageAgeGroup;
  imageUrls: string[];
  heightLabel?: string;
  widthLabel?: string;
}

interface GenerateDetailSectionImageInput extends GenerateSizeGuideImageInput {
  variant?: number;
}

interface GenerateUsageGuideImageInput extends GenerateDetailSectionImageInput {
  usageStep?: string;
}

interface InferColorSubtitleInput {
  productName: string;
  category: string;
  description: string;
  options: string;
  imageUrls: string[];
}

interface InferColorImageSelectionInput extends InferColorSubtitleInput {}

interface InferPackageImagePositionsInput {
  imageUrls: string[];
}

interface FetchedHeroImage {
  data: string;
  mimeType: string;
  label: string;
}

interface FetchedIndexedImage extends FetchedHeroImage {
  sourceIndex: number;
}

@Injectable()
export class DetailPageHeroImageService {
  private readonly logger = new Logger(DetailPageHeroImageService.name);

  constructor(
    @Inject(DETAIL_PAGE_MEDIA_PORT)
    private readonly media: DetailPageMediaPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
  ) {}

  async generateHeroBanner(input: GenerateHeroBannerInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 4);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_hero_image_no_inputs');
    }

    const generated = await this.media.generateImage({
      images,
      prompt: buildHeroBannerPrompt(input),
      aspectRatio: '16:9',
      imageSize: '2K',
      noImageErrorCode: 'detail_page_hero_image_returned_no_image',
      logContext: 'Gemini detail hero',
    });
    this.imageFetcher.assertSupportedMime(generated.mimeType);
    const key = `detail-page-hero-banners/${input.organizationId}/${randomUUID()}.${this.imageFetcher.extForMime(generated.mimeType)}`;
    return this.storage.save(key, generated.buffer, generated.mimeType);
  }

  async generateColorGuideImage(input: GenerateDetailSectionImageInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 8);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_color_image_no_inputs');
    }

    const generated = await this.media.generateImage({
      images,
      prompt: buildColorGuidePrompt(input),
      aspectRatio: '4:3',
      imageSize: '2K',
      noImageErrorCode: 'detail_page_color_image_returned_no_image',
      logContext: 'Gemini detail color',
    });
    this.imageFetcher.assertSupportedMime(generated.mimeType);
    const key = `detail-page-section-images/${input.organizationId}/color-guide-${randomUUID()}.${this.imageFetcher.extForMime(generated.mimeType)}`;
    return this.storage.save(key, generated.buffer, generated.mimeType);
  }

  async generatePackageGuideImage(input: GenerateSizeGuideImageInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 4);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_package_image_no_inputs');
    }

    const generated = await this.media.generateImage({
      images,
      prompt: buildPackageGuidePrompt(input),
      aspectRatio: '4:3',
      imageSize: '2K',
      noImageErrorCode: 'detail_page_package_image_returned_no_image',
      logContext: 'Gemini detail package',
    });
    this.imageFetcher.assertSupportedMime(generated.mimeType);
    const key = `detail-page-section-images/${input.organizationId}/package-guide-${randomUUID()}.${this.imageFetcher.extForMime(generated.mimeType)}`;
    return this.storage.save(key, generated.buffer, generated.mimeType);
  }

  async generateHeroProductImage(input: GenerateSizeGuideImageInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 8);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_hero_product_image_no_inputs');
    }

    const generated = await this.media.generateImage({
      images,
      prompt: buildHeroProductImagePrompt(input),
      aspectRatio: '4:3',
      imageSize: '2K',
      noImageErrorCode: 'detail_page_hero_product_image_returned_no_image',
      logContext: 'Gemini detail hero product',
    });
    this.imageFetcher.assertSupportedMime(generated.mimeType);
    const key = `detail-page-hero-products/${input.organizationId}/${randomUUID()}.${this.imageFetcher.extForMime(generated.mimeType)}`;
    return this.storage.save(key, generated.buffer, generated.mimeType);
  }

  async inferColorSubtitle(input: InferColorSubtitleInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 8);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_color_subtitle_no_inputs');
    }

    const text = await this.media.completeVisionJson({
      images,
      prompt: buildColorSubtitlePrompt(input),
    });
    if (!text) {
      throw new ServiceUnavailableException('detail_page_color_subtitle_returned_no_text');
    }

    const parsed = this.parseJsonObject(text);
    const subtitle = typeof parsed.subtitle === 'string' ? parsed.subtitle.trim() : '';
    if (!subtitle) {
      throw new ServiceUnavailableException('detail_page_color_subtitle_empty');
    }
    return subtitle.slice(0, 80);
  }

  async inferColorImageSelection(input: InferColorImageSelectionInput): Promise<number[]> {
    const images = await this.fetchIndexedInputImages(input.imageUrls, 15);
    if (images.length === 0) return [];

    const text = await this.media.completeVisionJson({
      images,
      prompt: buildColorImageSelectionPrompt(input),
    });
    if (!text) return [];

    const parsed = this.parseJsonObject(text);
    const rawIndices = parsed.imageIndices;
    if (!Array.isArray(rawIndices)) return [];
    const allowed = new Set(images.map((img) => img.sourceIndex));
    const unique = new Set<number>();
    for (const value of rawIndices) {
      if (Number.isInteger(value) && allowed.has(value)) unique.add(value);
    }
    return Array.from(unique).slice(0, 6);
  }

  async inferPackageImagePositions(input: InferPackageImagePositionsInput): Promise<number[]> {
    const images = await this.fetchIndexedInputImages(input.imageUrls, 10);
    if (images.length === 0) return [];

    const text = await this.media.completeVisionJson({
      images,
      prompt: buildPackageImagePositionsPrompt(),
    });
    if (!text) return [];

    const parsed = this.parseJsonObject(text);
    const rawPositions = parsed.packageCandidateIndices;
    if (!Array.isArray(rawPositions)) return [];
    const allowed = new Set(images.map((img) => img.sourceIndex));
    return rawPositions
      .filter((value): value is number => Number.isInteger(value) && allowed.has(value));
  }

  async generateDetailCutImage(input: GenerateDetailSectionImageInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 8);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_detail_image_no_inputs');
    }

    const generated = await this.media.generateImage({
      images,
      prompt: buildDetailCutPrompt(input),
      aspectRatio: '4:3',
      imageSize: '2K',
      noImageErrorCode: 'detail_page_detail_image_returned_no_image',
      logContext: 'Gemini detail cut',
    });
    this.imageFetcher.assertSupportedMime(generated.mimeType);
    const key = `detail-page-section-images/${input.organizationId}/detail-cut-${input.variant ?? 1}-${randomUUID()}.${this.imageFetcher.extForMime(generated.mimeType)}`;
    return this.storage.save(key, generated.buffer, generated.mimeType);
  }

  async generateUsageGuideImage(input: GenerateUsageGuideImageInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 6);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_usage_image_no_inputs');
    }

    const generated = await this.media.generateImage({
      images,
      prompt: buildUsageGuidePrompt(input),
      aspectRatio: '4:3',
      imageSize: '2K',
      noImageErrorCode: 'detail_page_usage_image_returned_no_image',
      logContext: 'Gemini detail usage',
    });
    this.imageFetcher.assertSupportedMime(generated.mimeType);
    const key = `detail-page-section-images/${input.organizationId}/usage-${input.variant ?? 1}-${randomUUID()}.${this.imageFetcher.extForMime(generated.mimeType)}`;
    return this.storage.save(key, generated.buffer, generated.mimeType);
  }

  async generateSizeGuideImage(input: GenerateSizeGuideImageInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 8);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_size_image_no_inputs');
    }

    const generated = await this.media.generateImage({
      images,
      prompt: buildSizeGuidePrompt(input),
      aspectRatio: '1:1',
      imageSize: '2K',
      noImageErrorCode: 'detail_page_size_image_returned_no_image',
      logContext: 'Gemini detail size',
    });
    this.imageFetcher.assertSupportedMime(generated.mimeType);
    const normalized = await this.normalizeSizeGuideImage(
      generated.buffer,
      generated.mimeType,
    );
    const key = `detail-page-size-guides/${input.organizationId}/${randomUUID()}.${this.imageFetcher.extForMime(normalized.mimeType)}`;
    return this.storage.save(key, normalized.buffer, normalized.mimeType);
  }

  private async normalizeSizeGuideImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      const cutout = await this.makeBorderWhiteTransparent(buffer);
      const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
      const normalized = await sharp(cutout)
        .rotate()
        .trim({ background: transparent, threshold: 4 })
        .extend({
          top: 32,
          bottom: 32,
          left: 32,
          right: 32,
          background: transparent,
        })
        .png()
        .toBuffer();

      return { buffer: normalized, mimeType: 'image/png' };
    } catch (error) {
      this.logger.warn(
        `detail size guide trim skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { buffer, mimeType };
    }
  }

  private async makeBorderWhiteTransparent(buffer: Buffer): Promise<Buffer> {
    const { data, info } = await sharp(buffer)
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;
    if (channels !== 4 || width <= 0 || height <= 0) {
      return buffer;
    }

    const totalPixels = width * height;
    const mask = new Uint8Array(totalPixels);
    const queue: number[] = [];

    for (let x = 0; x < width; x++) {
      queue.push(x, (height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      queue.push(y * width, y * width + width - 1);
    }

    const isWhiteBackground = (pixelIndex: number): boolean => {
      const offset = pixelIndex * channels;
      const alpha = data[offset + 3];
      if (alpha < 12) return true;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const min = Math.min(r, g, b);
      const max = Math.max(r, g, b);
      const brightness = (r + g + b) / 3;
      return min >= 235 && max - min <= 24 && brightness >= 242;
    };

    let head = 0;
    while (head < queue.length) {
      const pixel = queue[head++];
      if (pixel < 0 || pixel >= totalPixels || mask[pixel]) continue;
      if (!isWhiteBackground(pixel)) continue;
      mask[pixel] = 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x > 0) queue.push(pixel - 1);
      if (x < width - 1) queue.push(pixel + 1);
      if (y > 0) queue.push(pixel - width);
      if (y < height - 1) queue.push(pixel + width);
    }

    for (let pixel = 0; pixel < totalPixels; pixel++) {
      if (!mask[pixel]) continue;
      const offset = pixel * channels;
      data[offset + 3] = 0;
    }

    return sharp(data, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();
  }

  private async fetchInputImages(imageUrls: string[], limit: number): Promise<FetchedHeroImage[]> {
    const productUrls = imageUrls
      .filter((url) => url.trim() !== '' && !isSafetyLabelImageUrl(url))
      .slice(0, limit);
    const images: FetchedHeroImage[] = [];

    for (const [index, url] of productUrls.entries()) {
      try {
        const ownKey = this.storage.extractKey(url);
        const fetched = ownKey
          ? await this.imageFetcher.fetchTrustedStorageImage(url)
          : await this.imageFetcher.fetchImage(url);
        images.push({
          data: fetched.buffer.toString('base64'),
          mimeType: fetched.mimeType,
          label: `상품 이미지 ${index + 1}`,
        });
      } catch (error) {
        this.logger.warn(
          `detail hero input image skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return images;
  }

  private async fetchIndexedInputImages(imageUrls: string[], limit: number): Promise<FetchedIndexedImage[]> {
    const candidates = imageUrls
      .map((url, index) => ({ url, index }))
      .filter(({ url }) => url.trim() !== '' && !isSafetyLabelImageUrl(url))
      .slice(0, limit);
    const images: FetchedIndexedImage[] = [];

    for (const { url, index } of candidates) {
      try {
        const ownKey = this.storage.extractKey(url);
        const fetched = ownKey
          ? await this.imageFetcher.fetchTrustedStorageImage(url)
          : await this.imageFetcher.fetchImage(url);
        images.push({
          sourceIndex: index,
          data: fetched.buffer.toString('base64'),
          mimeType: fetched.mimeType,
          label: `candidateIndex=${index}`,
        });
      } catch (error) {
        this.logger.warn(
          `detail package classifier image skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return images;
  }

  private parseJsonObject(raw: string): Record<string, unknown> {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]+?)\n?```$/);
    const body = fenced ? fenced[1] : trimmed;
    return JSON.parse(body) as Record<string, unknown>;
  }
}
