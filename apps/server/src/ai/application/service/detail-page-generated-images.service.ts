import { Injectable, Optional } from '@nestjs/common';
import { isSafetyLabelImageUrl } from '../../domain/detail-page-image-order';
import type { BoldVerticalGeneration } from '../../domain/prompts/bold-vertical/single-call';
import type { DetailPageGeneration } from '../../domain/prompts/detail-page/single-call';
import type { DetailPageParsedGeneration, DetailPageRawInput, DetailPageTemplateId } from './detail-page-ai.types';
import { DetailPageHeroImageService } from './detail-page-hero-image.service';
import {
  colorPreference,
  countProductImages,
  normalizeUsageGuide,
  pickHeroSubhead,
  pickSectionSourceImages,
  pickSizeGuideSourceImages,
} from './detail-page-template-rules';

const GENERATED_HERO_BANNER_KEY = '__heroBanner';
const GENERATED_SIZE_GUIDE_IMAGE_KEY = '__sizeGuideImage';
const GENERATED_COLOR_GUIDE_IMAGE_KEY = '__colorGuideImage';
const GENERATED_USAGE_IMAGE_KEYS = ['__usageGuideImage1', '__usageGuideImage2', '__usageGuideImage3'] as const;
const GENERATED_DETAIL_IMAGE_KEYS = ['__detailImage1', '__detailImage2', '__detailImage3'] as const;
const MAX_GENERATED_USAGE_IMAGES = 1;
const MAX_GENERATED_DETAIL_IMAGES = 1;

@Injectable()
export class DetailPageGeneratedImagesService {
  constructor(
    @Optional()
    private readonly heroImageService?: DetailPageHeroImageService,
  ) {}

  async generateBestEffort(input: {
    organizationId: string;
    parsed: DetailPageParsedGeneration;
    templateId: DetailPageTemplateId;
    rawInput: DetailPageRawInput;
    productName: string;
    excludedImageIndices?: number[];
  }): Promise<Record<string, string>> {
    if (!this.heroImageService) return {};
    const processedImages: Record<string, string> = {};
    const excludedImageIndices = new Set(input.excludedImageIndices ?? []);
    const heroSourceImageUrls = input.rawInput.imageUrls.filter((url, index) => (
      !excludedImageIndices.has(index) && !isSafetyLabelImageUrl(url)
    ));

    const generateHero = () => this.heroImageService!.generateHeroBanner({
      organizationId: input.organizationId,
      productName: input.rawInput.rawTitle,
      category: input.rawInput.rawCategory,
      description: input.rawInput.rawDescription,
      options: input.rawInput.rawOptions,
      templateId: input.templateId,
      headline: input.productName,
      subhead: pickHeroSubhead(input.parsed, input.templateId),
      imageUrls: heroSourceImageUrls.length > 0 ? heroSourceImageUrls : input.rawInput.imageUrls,
    });

    if (input.templateId === 'bold-vertical') {
      processedImages[GENERATED_HERO_BANNER_KEY] = await generateHero();
    } else {
      try {
        processedImages[GENERATED_HERO_BANNER_KEY] = await generateHero();
      } catch {
        // Hero image generation is best-effort for legacy templates.
      }
    }

    if (input.templateId === 'bold-vertical') {
      processedImages[GENERATED_SIZE_GUIDE_IMAGE_KEY] =
        await this.heroImageService.generateSizeGuideImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          imageUrls: pickSizeGuideSourceImages(input.parsed, input.rawInput.imageUrls),
          heightLabel: (input.parsed as BoldVerticalGeneration).size?.heightLabel ?? '',
          widthLabel: (input.parsed as BoldVerticalGeneration).size?.widthLabel ?? '',
        });

      await this.generateBoldVerticalSectionImages(input, processedImages);
    }

    if (input.templateId === 'kids-playful') {
      await this.generateKidsPlayfulSectionImages(input, processedImages);
    }

    return processedImages;
  }

  private async generateBoldVerticalSectionImages(
    input: {
      organizationId: string;
      parsed: DetailPageParsedGeneration;
      rawInput: Pick<DetailPageRawInput, 'rawTitle' | 'rawCategory' | 'rawDescription' | 'rawOptions' | 'imageUrls'>;
    },
    processedImages: Record<string, string>,
  ): Promise<void> {
    if (!this.heroImageService) return;
    const parsed = input.parsed as BoldVerticalGeneration;
    const blockedIndices = new Set<number>([
      ...((parsed.packageImageIndices ?? []) as number[]),
      ...((parsed.safetyLabelImageIndices ?? []) as number[]),
    ]);
    const productImageCount = countProductImages(input.rawInput.imageUrls);
    const needsDerivedLayout = productImageCount <= 3;

    if ((parsed.color?.imageIndices ?? []).length === 0 && colorPreference(input.rawInput) !== 'none') {
      try {
        const url = await this.heroImageService.generateColorGuideImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          imageUrls: pickSectionSourceImages(
            parsed.color?.imageIndices ?? [],
            input.rawInput.imageUrls,
            blockedIndices,
          ),
        });
        processedImages[GENERATED_COLOR_GUIDE_IMAGE_KEY] = url;
      } catch {
        // Color guide image is best-effort; fallback to selected/uploaded images.
      }
    }

    const usageSteps = normalizeUsageGuide(parsed.usage?.subtitle ?? '', input.rawInput)
      .split('\n')
      .map((step) => step.trim())
      .filter(Boolean)
      .slice(0, GENERATED_USAGE_IMAGE_KEYS.length);
    if (usageSteps.length > 0) {
      for (const [index, key] of GENERATED_USAGE_IMAGE_KEYS.slice(0, MAX_GENERATED_USAGE_IMAGES).entries()) {
        const usageStep = usageSteps[index];
        if (!usageStep) continue;
        try {
          const url = await this.heroImageService.generateUsageGuideImage({
            organizationId: input.organizationId,
            productName: input.rawInput.rawTitle,
            category: input.rawInput.rawCategory,
            description: input.rawInput.rawDescription,
            options: input.rawInput.rawOptions,
            imageUrls: pickSectionSourceImages(
              parsed.usage?.imageIndices ?? [],
              input.rawInput.imageUrls,
              blockedIndices,
            ),
            usageStep,
            variant: index + 1,
          });
          if (url) processedImages[key] = url;
        } catch {
          // Usage guide images are best-effort; the template still renders text steps.
        }
      }
    }

    if (needsDerivedLayout || (parsed.detailImageIndices ?? []).length < 2) {
      for (const [index, key] of GENERATED_DETAIL_IMAGE_KEYS.slice(0, MAX_GENERATED_DETAIL_IMAGES).entries()) {
        try {
          const url = await this.heroImageService.generateDetailCutImage({
            organizationId: input.organizationId,
            productName: input.rawInput.rawTitle,
            category: input.rawInput.rawCategory,
            description: input.rawInput.rawDescription,
            options: input.rawInput.rawOptions,
            imageUrls: pickSectionSourceImages(
              parsed.detailImageIndices ?? [],
              input.rawInput.imageUrls,
              blockedIndices,
            ),
            variant: index + 1,
          });
          if (url) processedImages[key] = url;
        } catch {
          // Detail support images are best-effort; fallback to selected/uploaded images.
        }
      }
    }
  }

  private async generateKidsPlayfulSectionImages(
    input: {
      organizationId: string;
      parsed: DetailPageParsedGeneration;
      rawInput: Pick<DetailPageRawInput, 'rawTitle' | 'rawCategory' | 'rawDescription' | 'rawOptions' | 'imageUrls'>;
      excludedImageIndices?: number[];
    },
    processedImages: Record<string, string>,
  ): Promise<void> {
    if (!this.heroImageService) return;
    const parsed = input.parsed as DetailPageGeneration;
    const excludedIndices = new Set(input.excludedImageIndices ?? []);
    const preferredIndices = this.collectKidsPlayfulNormalImageIndices(parsed);
    const fallbackIndices = input.rawInput.imageUrls
      .map((_, index) => index)
      .filter((index) => !excludedIndices.has(index));
    const sourceImages = pickSectionSourceImages(
      preferredIndices.length > 0 ? preferredIndices : fallbackIndices,
      input.rawInput.imageUrls,
      excludedIndices,
    );
    if (sourceImages.length === 0) return;

    for (const [index, key] of GENERATED_USAGE_IMAGE_KEYS.slice(0, MAX_GENERATED_USAGE_IMAGES).entries()) {
      const scenario = parsed.section3.scenarios[index];
      if (!scenario || scenario.imageIndex !== null || processedImages[key]) continue;
      try {
        const url = await this.heroImageService.generateUsageGuideImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          imageUrls: sourceImages,
          usageStep: scenario.caption,
          variant: index + 1,
        });
        if (url) processedImages[key] = url;
      } catch {
        // Generated usage images are best-effort; the section can still show text.
      }
    }

    const needsDetailImages = [
      parsed.section5.imageIndex,
      ...parsed.section6.cards.map((card) => card.imageIndex),
      parsed.section7.imageIndex,
      ...parsed.section8.blocks.map((block) => block.imageIndex),
      ...parsed.section10.cards.map((card) => card.imageIndex),
    ].some((imageIndex) => imageIndex === null);
    if (!needsDetailImages) return;

    for (const [index, key] of GENERATED_DETAIL_IMAGE_KEYS.slice(0, MAX_GENERATED_DETAIL_IMAGES).entries()) {
      if (processedImages[key]) continue;
      try {
        const url = await this.heroImageService.generateDetailCutImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          imageUrls: sourceImages,
          variant: index + 1,
        });
        if (url) processedImages[key] = url;
      } catch {
        // Generated detail images are best-effort; raw images or placeholders remain valid.
      }
    }
  }

  private collectKidsPlayfulNormalImageIndices(parsed: DetailPageGeneration): number[] {
    const values = [
      parsed.section1.heroImageIndex,
      ...parsed.section3.scenarios.map((scenario) => scenario.imageIndex),
      parsed.section4.moodImageIndex,
      parsed.section5.imageIndex,
      ...parsed.section6.cards.map((card) => card.imageIndex),
      parsed.section7.imageIndex,
      ...parsed.section8.blocks.map((block) => block.imageIndex),
      ...parsed.section10.cards.map((card) => card.imageIndex),
    ];
    return Array.from(new Set(values.filter((value): value is number => Number.isInteger(value))));
  }
}
