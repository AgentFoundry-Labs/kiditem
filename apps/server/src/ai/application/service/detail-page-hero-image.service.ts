import { randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import { StorageService } from '../../../common/storage/storage.service';
import { ThumbnailImageFetcherService } from '../../adapter/out/image-fetch/thumbnail-image-fetcher.adapter';
import {
  requireGeminiApiKey,
  requireGeminiImageModel,
  requireGeminiVisionModel,
} from '../../adapter/out/gemini/thumbnail-gemini-config';
import { isSafetyLabelImageUrl } from '../../domain/detail-page-image-order';

const sharp: typeof import('sharp') = require('sharp');

interface GenerateHeroBannerInput {
  organizationId: string;
  productName: string;
  category: string;
  description: string;
  options: string;
  templateId: 'kids-playful' | 'bold-vertical';
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
  private client: GoogleGenAI | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly imageFetcher: ThumbnailImageFetcherService,
  ) {}

  async generateHeroBanner(input: GenerateHeroBannerInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 4);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_hero_image_no_inputs');
    }

    const response = await this.getClient().models.generateContent({
      model: requireGeminiImageModel(),
      contents: [
        {
          role: 'user',
          parts: [
            ...images.flatMap((img) => [
              { text: `[${img.label}]` },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
            ]),
            { text: this.buildPrompt(input) },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!imagePart?.data) {
      const text = parts.find((part) => part.text)?.text?.slice(0, 300);
      this.logger.warn(`Gemini detail hero response had no image. text=${text ?? '(empty)'}`);
      throw new ServiceUnavailableException('detail_page_hero_image_returned_no_image');
    }

    const mimeType = imagePart.mimeType ?? 'image/png';
    this.imageFetcher.assertSupportedMime(mimeType);
    const buffer = Buffer.from(imagePart.data, 'base64');
    const key = `detail-page-hero-banners/${input.organizationId}/${randomUUID()}.${this.imageFetcher.extForMime(mimeType)}`;
    return this.storage.save(key, buffer, mimeType);
  }

  async generateColorGuideImage(input: GenerateDetailSectionImageInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 8);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_color_image_no_inputs');
    }

    const response = await this.getClient().models.generateContent({
      model: requireGeminiImageModel(),
      contents: [
        {
          role: 'user',
          parts: [
            ...images.flatMap((img) => [
              { text: `[${img.label}]` },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
            ]),
            { text: this.buildColorGuidePrompt(input) },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: { aspectRatio: '4:3', imageSize: '2K' },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!imagePart?.data) {
      const text = parts.find((part) => part.text)?.text?.slice(0, 300);
      this.logger.warn(`Gemini detail color response had no image. text=${text ?? '(empty)'}`);
      throw new ServiceUnavailableException('detail_page_color_image_returned_no_image');
    }

    const mimeType = imagePart.mimeType ?? 'image/png';
    this.imageFetcher.assertSupportedMime(mimeType);
    const buffer = Buffer.from(imagePart.data, 'base64');
    const key = `detail-page-section-images/${input.organizationId}/color-guide-${randomUUID()}.${this.imageFetcher.extForMime(mimeType)}`;
    return this.storage.save(key, buffer, mimeType);
  }

  async inferColorSubtitle(input: InferColorSubtitleInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 8);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_color_subtitle_no_inputs');
    }

    const response = await this.getClient().models.generateContent({
      model: requireGeminiVisionModel(),
      contents: [
        {
          role: 'user',
          parts: [
            ...images.flatMap((img) => [
              { text: `[${img.label}]` },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
            ]),
            { text: this.buildColorSubtitlePrompt(input) },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const text = response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
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

    const response = await this.getClient().models.generateContent({
      model: requireGeminiVisionModel(),
      contents: [
        {
          role: 'user',
          parts: [
            ...images.flatMap((img) => [
              { text: `[candidateIndex=${img.sourceIndex}]` },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
            ]),
            { text: this.buildColorImageSelectionPrompt(input) },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const text = response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
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

    const response = await this.getClient().models.generateContent({
      model: requireGeminiVisionModel(),
      contents: [
        {
          role: 'user',
          parts: [
            ...images.flatMap((img) => [
              { text: `[candidateIndex=${img.sourceIndex}]` },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
            ]),
            { text: this.buildPackageImagePositionsPrompt() },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const text = response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
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

    const response = await this.getClient().models.generateContent({
      model: requireGeminiImageModel(),
      contents: [
        {
          role: 'user',
          parts: [
            ...images.flatMap((img) => [
              { text: `[${img.label}]` },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
            ]),
            { text: this.buildDetailCutPrompt(input) },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: { aspectRatio: '4:3', imageSize: '2K' },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!imagePart?.data) {
      const text = parts.find((part) => part.text)?.text?.slice(0, 300);
      this.logger.warn(`Gemini detail cut response had no image. text=${text ?? '(empty)'}`);
      throw new ServiceUnavailableException('detail_page_detail_image_returned_no_image');
    }

    const mimeType = imagePart.mimeType ?? 'image/png';
    this.imageFetcher.assertSupportedMime(mimeType);
    const buffer = Buffer.from(imagePart.data, 'base64');
    const key = `detail-page-section-images/${input.organizationId}/detail-cut-${input.variant ?? 1}-${randomUUID()}.${this.imageFetcher.extForMime(mimeType)}`;
    return this.storage.save(key, buffer, mimeType);
  }

  async generateUsageGuideImage(input: GenerateUsageGuideImageInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 6);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_usage_image_no_inputs');
    }

    const response = await this.getClient().models.generateContent({
      model: requireGeminiImageModel(),
      contents: [
        {
          role: 'user',
          parts: [
            ...images.flatMap((img) => [
              { text: `[${img.label}]` },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
            ]),
            { text: this.buildUsageGuidePrompt(input) },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: { aspectRatio: '4:3', imageSize: '2K' },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!imagePart?.data) {
      const text = parts.find((part) => part.text)?.text?.slice(0, 300);
      this.logger.warn(`Gemini detail usage response had no image. text=${text ?? '(empty)'}`);
      throw new ServiceUnavailableException('detail_page_usage_image_returned_no_image');
    }

    const mimeType = imagePart.mimeType ?? 'image/png';
    this.imageFetcher.assertSupportedMime(mimeType);
    const buffer = Buffer.from(imagePart.data, 'base64');
    const key = `detail-page-section-images/${input.organizationId}/usage-${input.variant ?? 1}-${randomUUID()}.${this.imageFetcher.extForMime(mimeType)}`;
    return this.storage.save(key, buffer, mimeType);
  }

  async generateSizeGuideImage(input: GenerateSizeGuideImageInput): Promise<string> {
    const images = await this.fetchInputImages(input.imageUrls, 8);
    if (images.length === 0) {
      throw new ServiceUnavailableException('detail_page_size_image_no_inputs');
    }

    const response = await this.getClient().models.generateContent({
      model: requireGeminiImageModel(),
      contents: [
        {
          role: 'user',
          parts: [
            ...images.flatMap((img) => [
              { text: `[${img.label}]` },
              { inlineData: { data: img.data, mimeType: img.mimeType } },
            ]),
            { text: this.buildSizeGuidePrompt(input) },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!imagePart?.data) {
      const text = parts.find((part) => part.text)?.text?.slice(0, 300);
      this.logger.warn(`Gemini detail size response had no image. text=${text ?? '(empty)'}`);
      throw new ServiceUnavailableException('detail_page_size_image_returned_no_image');
    }

    const mimeType = imagePart.mimeType ?? 'image/png';
    this.imageFetcher.assertSupportedMime(mimeType);
    const normalized = await this.normalizeSizeGuideImage(
      Buffer.from(imagePart.data, 'base64'),
      mimeType,
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
          label: `상품 이미지 ${index + 1}`,
        });
      } catch (error) {
        this.logger.warn(
          `detail package classifier image skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return images;
  }

  private buildPrompt(input: GenerateHeroBannerInput): string {
    const tone = input.templateId === 'bold-vertical'
      ? 'bright Korean kids-product detail page hero, soft premium studio mood, playful but clean'
      : 'energetic Korean kids trend-detail hero, fun lifestyle mood, vivid but polished';

    return [
      'Create one wide ecommerce detail-page hero banner image.',
      `Product name: ${input.productName}`,
      `Category: ${input.category}`,
      `Headline mood: ${input.headline}`,
      `Subhead: ${input.subhead}`,
      `Product notes: ${input.description}`,
      input.options ? `Options/specs: ${input.options}` : '',
      '',
      'Composition requirements:',
      `- Mood/style: ${tone}.`,
      '- Use the provided product photos as the exact product reference.',
      '- Preserve the product shape, colors, materials, and recognizable details as much as possible.',
      '- Generate a NEW matching background scene or styled backdrop that fits the product mood. For bubble toys, use playful bubbles, bright clean light, and a child-friendly outdoor/playroom mood.',
      '- Do NOT paste, crop, enlarge, or reuse the original uploaded photo as the whole banner.',
      '- Do NOT use a raw package/display-box photo as the banner. Package can be referenced for product identity only.',
      '- The final banner must clearly look like a generated commercial hero image with a fresh background and intentionally staged product.',
      '- Keep the product large, centered, and fully visible inside the safe center area.',
      '- Use a clean 16:9 wide composition suitable for the very top of a Korean mobile product detail page.',
      '- Do not add Korean text, English text, logos, watermarks, price badges, labels, or UI elements inside the image.',
      '- Avoid cropping off important product parts.',
      '- Photorealistic commercial product shot, not a flat illustration.',
    ].filter(Boolean).join('\n');
  }

  private buildColorGuidePrompt(input: GenerateDetailSectionImageInput): string {
    return [
      'Create one ecommerce detail-page color/options guide image.',
      `Product name: ${input.productName}`,
      `Category: ${input.category}`,
      `Product notes: ${input.description}`,
      input.options ? `Options/specs: ${input.options}` : '',
      '',
      'Composition requirements:',
      '- This image will be placed ONLY in the "색상 안내" section of a Korean product detail page.',
      '- Use the provided product photos as the exact product reference.',
      '- If the references visibly contain multiple color variants, arrange all real visible variants in a clean horizontal row or gentle diagonal group.',
      '- If only one product photo is available, create a fresh composition of the same real product using a new angle/background; do not invent unsupported colors.',
      '- If Options/specs explicitly says "색상 구성: 단일 색상", keep it as a single-color guide and do not invent extra variants.',
      '- If Options/specs explicitly says "색상 구성: 여러 색상", include only visible real product variants from the references.',
      '- Do not add color names, callout labels, Korean text, English text, icons, arrows, badges, or captions inside the image. The HTML template will render all text separately.',
      '- Never use a package box, display box, barcode/KC/safety label, size chart, instruction sheet, or unrelated prop as the main subject.',
      '- Preserve real product colors and printed artwork. Do not merge colors or change the product identity.',
      '- Use a bright playful background suitable for kids goods, with enough contrast for the product.',
      '- No prices, discount badges, shop logos, watermarks, or text of any kind.',
      '- Photorealistic commercial product composition, not a flat illustration.',
    ].filter(Boolean).join('\n');
  }

  private buildColorSubtitlePrompt(input: InferColorSubtitleInput): string {
    return [
      'Look at the provided product photos and infer the REAL visible product color variants.',
      `Product name: ${input.productName}`,
      `Category: ${input.category}`,
      input.description ? `Product notes: ${input.description}` : '',
      input.options ? `Seller options/spec hints: ${input.options}` : '',
      '',
      'Return JSON only: {"subtitle":"..."}',
      '',
      'Rules:',
      '- The subtitle must be Korean and fit a Korean ecommerce color section.',
      '- Use visible product colors from the photos as the source of truth. Do not trust seller options/spec hints when they conflict with the image.',
      '- If Seller options/spec hints explicitly says "색상 구성: 단일 색상", return a single-color subtitle unless the photos clearly show separate real variants.',
      '- If Seller options/spec hints explicitly says "색상 구성: 여러 색상", still list only colors that are visible on real products in the photos.',
      '- Prefer natural Korean color names such as 민트, 그린, 초록, 핑크, 옐로우, 노랑, 오렌지, 블랙, 화이트.',
      '- If a variant is mint/green, do NOT call it blue/블루.',
      '- Exclude package box colors, KC/safety label colors, background colors, text print colors, shadows, and lighting artifacts.',
      '- If multiple variants are visible, format like "민트 / 핑크 / 옐로우 3가지 색상".',
      '- If only one visible product color exists, format like "핑크 단일 색상".',
      '- If colors are impossible to judge, use "상품 이미지 기준 색상 확인".',
      '- Keep subtitle under 40 Korean characters if possible.',
    ].filter(Boolean).join('\n');
  }

  private buildColorImageSelectionPrompt(input: InferColorImageSelectionInput): string {
    return [
      'Choose which uploaded images should be used in the "색상 안내" section of a Korean ecommerce detail page.',
      `Product name: ${input.productName}`,
      `Category: ${input.category}`,
      input.description ? `Product notes: ${input.description}` : '',
      input.options ? `Seller options/spec hints: ${input.options}` : '',
      '',
      'Return JSON only: {"mode":"combined|separate|single","imageIndices":[number, ...]}',
      '',
      'Decision rules:',
      '- Use the visual content of the images as the source of truth.',
      '- If Seller options/spec hints explicitly says "색상 구성: 단일 색상", return mode "single" with only the clearest product color image unless multiple real product variants are visibly separate.',
      '- If Seller options/spec hints explicitly says "색상 구성: 여러 색상", verify that the variants are visible before choosing multiple images.',
      '- If there are clean individual product photos for each real color variant, choose those individual images, one per visible variant.',
      '- If the variants are not separated and one image already shows the visible colors together, choose ONLY that one combined image.',
      '- If both a combined lineup and enough individual color photos exist, prefer the individual color photos.',
      '- Never mix a combined lineup image with the individual variant images in the same result.',
      '- Exclude package/display boxes, KC/safety labels, barcodes, instruction sheets, size guides, hands-only crops, lifestyle scenes, and unrelated props.',
      '- Do not choose images based on package/background colors. Only product body/cap/variant colors count.',
      '- Keep the result concise: one combined image OR 2-6 individual variant images.',
      '- If color variants are impossible to judge, return the single clearest product color image.',
    ].filter(Boolean).join('\n');
  }

  private buildPackageImagePositionsPrompt(): string {
    return [
      'Classify which candidate images are primarily retail packaging, package boxes, display boxes, outer cartons, or product-in-box composition photos.',
      'Return JSON only: {"packageCandidateIndices":[number, ...]}',
      '',
      'Rules:',
      '- Use the exact candidateIndex numbers shown before each image.',
      '- Include images where a package/display box is a visible main subject or large supporting subject.',
      '- Include open retail display boxes, boxed sets, outer product boxes, or photos where the product is shown together with its box.',
      '- Do NOT include ordinary product-only images, color variant lineups without packaging, size guide images, usage/detail close-ups, safety/KC labels, barcodes, or instruction sheets.',
      '- Do NOT classify a product as packaging just because the physical product itself is box-shaped.',
      '- If unsure, leave it out.',
    ].join('\n');
  }

  private buildDetailCutPrompt(input: GenerateDetailSectionImageInput): string {
    const variant = input.variant ?? 1;
    const variantDirection = variant % 2 === 0
      ? 'Show a usage/detail moment such as a hand interaction, opening, button, texture, functional part, or close-up feature. Keep it clean and product-focused.'
      : 'Show a polished product detail composition that highlights shape, material, print, set contents, or an alternate angle. Keep the product large and inspectable.';

    return [
      'Create one ecommerce detail-page supporting image.',
      `Product name: ${input.productName}`,
      `Category: ${input.category}`,
      `Product notes: ${input.description}`,
      input.options ? `Options/specs: ${input.options}` : '',
      '',
      'Composition requirements:',
      '- This image will be placed ONLY in the "DETAIL" section of a Korean product detail page.',
      '- IMAGE-ONLY OUTPUT: not a callout card, poster, infographic, or designed text panel.',
      '- Do not create a "DETAIL FEATURE CALLOUT" design. The template supplies all headings and captions separately.',
      `- ${variantDirection}`,
      '- Use the provided product photos as the exact product reference.',
      '- Never design a new product, new shape, new character, or new package. Only restage the same product from the references.',
      '- If source images are too few, create a new camera composition/background from the same product instead of repeating the same crop.',
      '- Vary the composition from previous sections: use a different crop, zoom level, camera angle, or product placement while keeping the product recognizable.',
      '- Prefer enlarged product composition shots that make the product easier to inspect, not another full duplicate of the uploaded photo.',
      '- Preserve product shape, proportions, colors, printed artwork, materials, and important physical details.',
      '- Do not render the product name inside this image.',
      '- No Korean text, English text, numbers, fake KC marks, barcodes, certifications, brand logos, prices, watermarks, or long text.',
      '- Avoid package boxes as the main subject unless the input photo clearly shows the package and the detail page needs a 구성/패키지 컷.',
      '- Use a clean bright kids-product ecommerce look, with the product fully visible and not awkwardly cropped.',
      '- Photorealistic commercial product shot, not a flat illustration.',
    ].filter(Boolean).join('\n');
  }

  private buildUsageGuidePrompt(input: GenerateUsageGuideImageInput): string {
    const variant = input.variant ?? 1;
    return [
      'Create one ecommerce product usage photo.',
      `Product name: ${input.productName}`,
      `Category: ${input.category}`,
      `Product notes: ${input.description}`,
      input.options ? `Options/specs: ${input.options}` : '',
      input.usageStep ? `Usage step reference: ${input.usageStep}` : '',
      '',
      'Composition requirements:',
      '- IMAGE-ONLY OUTPUT: create only a clean product photo showing the action.',
      '- Do not create an instruction card, tutorial panel, app UI, label sheet, or infographic.',
      '- Do not render "사용법 안내", step numbers, Korean text, English text, icons, arrows, captions, badges, or labels inside the image.',
      '- Use the provided product photos as the exact product reference.',
      '- Preserve product shape, proportions, colors, printed artwork, and materials.',
      '- Show a realistic hand interaction only if it helps explain the step; use natural short nails, no manicure, no nail polish.',
      `- Variant ${variant}: choose a slightly different camera angle or hand position while keeping the product inspectable.`,
      '- Clean bright kids-product ecommerce look, photorealistic, no illustration.',
    ].filter(Boolean).join('\n');
  }

  private buildSizeGuidePrompt(input: GenerateSizeGuideImageInput): string {
    const orientation = this.describeSizeGuideOrientation(input);

    return [
      'Create one isolated product cutout image for an ecommerce size guide.',
      `Product name: ${input.productName}`,
      `Category: ${input.category}`,
      `Product notes: ${input.description}`,
      input.options ? `Options/specs: ${input.options}` : '',
      '',
      'Composition requirements:',
      '- HARD REQUIREMENT: output exactly ONE single product unit only, enlarged and centered.',
      '- Gemini must choose/isolate one product unit from the references and create a new centered size-guide image. Do not simply reuse an uploaded crop.',
      '- If the references show multiple color variants, choose the clearest front-facing single unit, preferably the center/default variant, and remove every other unit.',
      '- If there is no single-unit source photo, isolate one representative unit from a group photo and reconstruct it as a clean single-product cutout.',
      '- Never output a group photo, multi-color lineup, package box, display box, hand, or lifestyle scene.',
      '- Remove all duplicate units, packaging boxes, hands, props, lifestyle backgrounds, text overlays, logos added by AI, badges, and measurement labels.',
      '- Preserve the real product shape, colors, printed illustrations, materials, and proportions as much as possible.',
      '- The product must be fully visible, exactly centered, and large enough to read size clearly.',
      orientation,
      '- Match the product visual orientation to the measurement labels. Do not rotate a wide product upright, and do not lay down a tall product sideways.',
      '- The template will draw the height label on the left vertical guide and the width label on the bottom horizontal guide, so the generated product silhouette must agree with those axes.',
      '- Crop tightly around the product with only small clean padding. Do not place the product inside a large square canvas.',
      '- The product should fill most of the image height, with no more than about 6% empty margin after cropping.',
      '- Output a clean transparent-background PNG cutout if supported.',
      '- If transparency is unavailable, use a pure white (#FFFFFF) border-connected background only so the application can remove it. Do not leave an inner white rectangle or photo card behind the product.',
      '- Remove every background pixel around the product silhouette. The final product should visually sit directly on the template background after trimming.',
      '- Absolutely do not add measurement lines, arrows, rulers, dimension text, or numbers. The template will overlay measurement guides separately.',
      '- Photorealistic product-only studio cutout, not an illustration.',
    ].filter(Boolean).join('\n');
  }

  private describeSizeGuideOrientation(input: GenerateSizeGuideImageInput): string {
    const width = this.parseDimensionLabel(input.widthLabel);
    const height = this.parseDimensionLabel(input.heightLabel);
    if (width === null || height === null || width === height) {
      return '- Keep the product in its natural front-facing orientation from the reference photos.';
    }
    if (width > height) {
      return [
        `- HARD REQUIREMENT: ${input.widthLabel} is the horizontal width and ${input.heightLabel} is the vertical height.`,
        '- The final product silhouette must be visibly wider than tall, like a landscape rectangle.',
        '- Do not stand the product upright or make it appear taller than its width.',
      ].join('\n');
    }
    return [
      `- HARD REQUIREMENT: ${input.heightLabel} is the vertical height and ${input.widthLabel} is the horizontal width.`,
      '- The final product silhouette must be visibly taller than wide, like a portrait rectangle.',
      '- Do not rotate the product sideways or make it appear wider than its height.',
    ].join('\n');
  }

  private parseDimensionLabel(label: string | undefined): number | null {
    if (!label) return null;
    const match = label.trim().match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/i);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    const unit = match[2].toLowerCase();
    if (unit === 'm') return value * 1000;
    if (unit === 'cm') return value * 10;
    return value;
  }

  private getClient(): GoogleGenAI {
    const apiKey = requireGeminiApiKey();
    if (!this.client) this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  private parseJsonObject(raw: string): Record<string, unknown> {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]+?)\n?```$/);
    const body = fenced ? fenced[1] : trimmed;
    return JSON.parse(body) as Record<string, unknown>;
  }
}
