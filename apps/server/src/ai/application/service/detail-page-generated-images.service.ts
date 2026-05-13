import { Injectable, Logger, Optional } from '@nestjs/common';
import { isSafetyLabelImageUrl } from '../../domain/detail-page-image-order';
import type { BoldVerticalGeneration } from '../../domain/prompts/bold-vertical/single-call';
import type { DetailPageGeneration } from '../../domain/prompts/detail-page/single-call';
import { resolveDetailImageCountLimit } from '../../domain/prompts/detail-page/types';
import type { DetailPageParsedGeneration, DetailPageRawInput, DetailPageTemplateId } from './detail-page-ai.types';
import { DetailPageHeroImageService } from './detail-page-hero-image.service';
import {
  colorPreference,
  normalizeUsageGuide,
  pickHeroSubhead,
  pickSectionSourceImages,
} from './detail-page-template-rules';

const GENERATED_HERO_BANNER_KEY = '__heroBanner';
const GENERATED_HERO_PRODUCT_IMAGE_KEY = '__heroProductImage';
const GENERATED_SIZE_GUIDE_IMAGE_KEY = '__sizeGuideImage';
const GENERATED_COLOR_GUIDE_IMAGE_KEY = '__colorGuideImage';
const GENERATED_PACKAGE_GUIDE_IMAGE_KEY = '__packageGuideImage';
const GENERATED_USAGE_IMAGE_KEYS = ['__usageGuideImage1', '__usageGuideImage2', '__usageGuideImage3'] as const;
const GENERATED_DETAIL_IMAGE_KEYS = [
  '__detailImage1',
  '__detailImage2',
  '__detailImage3',
  '__detailImage4',
  '__detailImage5',
  '__detailImage6',
] as const;
const MAX_BOLD_VERTICAL_USAGE_IMAGES = GENERATED_USAGE_IMAGE_KEYS.length;
const MAX_BOLD_VERTICAL_DETAIL_IMAGES = GENERATED_DETAIL_IMAGE_KEYS.length;
const MAX_KIDS_PLAYFUL_USAGE_IMAGES = 1;
const MAX_KIDS_PLAYFUL_DETAIL_IMAGES = 1;

@Injectable()
export class DetailPageGeneratedImagesService {
  private readonly logger = new Logger(DetailPageGeneratedImagesService.name);

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
    const sourcePolicy = buildNormalSectionSourcePolicy(
      input.parsed,
      input.rawInput.imageUrls,
      input.excludedImageIndices,
    );
    const heroBannerSourceImageUrls = sourcePolicy.normalImageUrls;

    const generateHero = () => this.heroImageService!.generateHeroBanner({
      organizationId: input.organizationId,
      productName: input.rawInput.rawTitle,
      category: input.rawInput.rawCategory,
      description: input.rawInput.rawDescription,
      options: input.rawInput.rawOptions,
      templateId: input.templateId,
      ageGroup: input.rawInput.ageGroup,
      headline: input.productName,
      subhead: pickHeroSubhead(input.parsed, input.templateId),
      imageUrls: heroBannerSourceImageUrls,
    });

    await this.generateInto(
      processedImages,
      GENERATED_HERO_BANNER_KEY,
      'detail hero image',
      generateHero,
    );

    if (input.templateId === 'bold-vertical') {
      const bold = input.parsed as BoldVerticalGeneration;
      const heroProductSourceImageUrls = pickPreferredSectionSourceImages(
        collectBoldHeroProductSourceIndices(bold),
        input.rawInput.imageUrls,
        sourcePolicy.blockedIndices,
      );
      await this.generateHeroProductImageInto(
        processedImages,
        {
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          ageGroup: input.rawInput.ageGroup,
          preferredImageUrls: mergeImageUrlGroups([
            sourcePolicy.normalImageUrls,
            heroProductSourceImageUrls,
          ]),
          fallbackImageUrls: heroProductSourceImageUrls,
        },
      );

      await this.generateInto(
        processedImages,
        GENERATED_SIZE_GUIDE_IMAGE_KEY,
        'detail size guide image',
        () => this.heroImageService!.generateSizeGuideImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          ageGroup: input.rawInput.ageGroup,
          imageUrls: pickSectionSourceImagesWithFallback(
            bold.size?.imageIndices ?? [],
            input.rawInput.imageUrls,
            sourcePolicy,
          ),
          heightLabel: bold.size?.heightLabel ?? '',
          widthLabel: bold.size?.widthLabel ?? '',
        }),
      );

      await this.generateBoldVerticalSectionImages(input, processedImages);
    }

    if (input.templateId === 'kids-playful') {
      await this.generateKidsPlayfulSectionImages(input, processedImages);
    }

    return processedImages;
  }

  private async generateHeroProductImageInto(
    processedImages: Record<string, string>,
    input: {
      organizationId: string;
      productName: string;
      category: string;
      description: string;
      options: string;
      ageGroup?: DetailPageRawInput['ageGroup'];
      preferredImageUrls: string[];
      fallbackImageUrls: string[];
    },
  ): Promise<void> {
    if (!this.heroImageService) return;

    const attempts = uniqueImageUrlGroups([
      input.preferredImageUrls,
      input.fallbackImageUrls,
    ]);
    for (const [attemptIndex, imageUrls] of attempts.entries()) {
      if (imageUrls.length === 0) continue;
      try {
        const url = await this.heroImageService.generateHeroProductImage({
          organizationId: input.organizationId,
          productName: input.productName,
          category: input.category,
          description: input.description,
          options: input.options,
          ageGroup: input.ageGroup,
          imageUrls,
        });
        if (url) {
          processedImages[GENERATED_HERO_PRODUCT_IMAGE_KEY] = url;
          return;
        }
      } catch (error) {
        this.logger.warn(
          `detail hero product image attempt ${attemptIndex + 1} skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async generateBoldVerticalSectionImages(
    input: {
      organizationId: string;
      parsed: DetailPageParsedGeneration;
      rawInput: DetailPageRawInput;
      excludedImageIndices?: number[];
    },
    processedImages: Record<string, string>,
  ): Promise<void> {
    if (!this.heroImageService) return;
    const parsed = input.parsed as BoldVerticalGeneration;
    const sourcePolicy = buildNormalSectionSourcePolicy(
      parsed,
      input.rawInput.imageUrls,
      input.excludedImageIndices,
    );
    const detailImageLimit = resolveDetailImageCountLimit(input.rawInput.detailImageCount);

    if (colorPreference(input.rawInput) !== 'none') {
      await this.generateColorGuideImageInto(processedImages, {
        organizationId: input.organizationId,
        productName: input.rawInput.rawTitle,
        category: input.rawInput.rawCategory,
        description: input.rawInput.rawDescription,
        options: input.rawInput.rawOptions,
        ageGroup: input.rawInput.ageGroup,
        preferredImageUrls: mergeImageUrlGroups([
          pickPreferredSectionSourceImages(
            parsed.color?.imageIndices ?? [],
            input.rawInput.imageUrls,
            sourcePolicy.blockedIndices,
          ),
          sourcePolicy.normalImageUrls,
        ]),
        fallbackImageUrls: sourcePolicy.normalImageUrls,
      });
    }

    const packageImageIndices = resolveEffectivePackageImageIndices({
      packageLabel: parsed.packageLabel,
      packageImageIndices: parsed.packageImageIndices,
      colorImageIndices: parsed.color?.imageIndices,
      hookImageIndex: parsed.hook?.imageIndex,
      imageUrls: input.rawInput.imageUrls,
    });
    if (packageImageIndices.length > 0 && (parsed.packageLabel ?? '').trim() !== '') {
      const packageSourceImageUrls = packageImageIndices
        .map((idx) => input.rawInput.imageUrls[idx])
        .filter((url): url is string => typeof url === 'string' && url.trim() !== '');
      if (packageSourceImageUrls.length > 0) {
        await this.generateInto(
          processedImages,
          GENERATED_PACKAGE_GUIDE_IMAGE_KEY,
          'detail package guide image',
          () => this.heroImageService!.generatePackageGuideImage({
            organizationId: input.organizationId,
            productName: input.rawInput.rawTitle,
            category: input.rawInput.rawCategory,
            description: input.rawInput.rawDescription,
            options: input.rawInput.rawOptions,
            ageGroup: input.rawInput.ageGroup,
            imageUrls: packageSourceImageUrls,
          }),
        );
      }
    }

    const usageSteps = parsed.usageEnabled === false || input.rawInput.usageSectionMode === 'exclude'
      ? []
      : normalizeUsageGuide(parsed.usage?.subtitle ?? '', input.rawInput)
          .split('\n')
          .map((step) => step.trim())
          .filter(Boolean)
          .slice(0, GENERATED_USAGE_IMAGE_KEYS.length);
    if (usageSteps.length > 0) {
      for (const [index, key] of GENERATED_USAGE_IMAGE_KEYS.slice(0, MAX_BOLD_VERTICAL_USAGE_IMAGES).entries()) {
        const usageStep = usageSteps[index];
        if (!usageStep) continue;
        if ((parsed.packageImageIndices ?? []).length > 0 && isPackageUsageStep(usageStep)) {
          continue;
        }
        await this.generateInto(
          processedImages,
          key,
          `detail usage guide image ${index + 1}`,
          () => this.heroImageService!.generateUsageGuideImage({
            organizationId: input.organizationId,
            productName: input.rawInput.rawTitle,
            category: input.rawInput.rawCategory,
            description: input.rawInput.rawDescription,
            options: input.rawInput.rawOptions,
            ageGroup: input.rawInput.ageGroup,
            imageUrls: pickSectionSourceImagesWithFallback(
              parsed.usage?.imageIndices ?? [],
              input.rawInput.imageUrls,
              sourcePolicy,
            ),
            usageStep,
            variant: index + 1,
          }),
        );
      }
    }

    const maxGeneratedDetailImages = Math.min(MAX_BOLD_VERTICAL_DETAIL_IMAGES, detailImageLimit);
    if (maxGeneratedDetailImages > 0) {
      for (const [index, key] of GENERATED_DETAIL_IMAGE_KEYS.slice(0, maxGeneratedDetailImages).entries()) {
        await this.generateInto(
          processedImages,
          key,
          `detail support image ${index + 1}`,
          () => this.heroImageService!.generateDetailCutImage({
            organizationId: input.organizationId,
            productName: input.rawInput.rawTitle,
            category: input.rawInput.rawCategory,
            description: input.rawInput.rawDescription,
            options: input.rawInput.rawOptions,
            ageGroup: input.rawInput.ageGroup,
            imageUrls: pickSectionSourceImagesWithFallback(
              parsed.detailImageIndices ?? [],
              input.rawInput.imageUrls,
              sourcePolicy,
            ),
            variant: index + 1,
          }),
        );
      }
    }
  }

  private async generateColorGuideImageInto(
    processedImages: Record<string, string>,
    input: {
      organizationId: string;
      productName: string;
      category: string;
      description: string;
      options: string;
      ageGroup?: DetailPageRawInput['ageGroup'];
      preferredImageUrls: string[];
      fallbackImageUrls: string[];
    },
  ): Promise<void> {
    if (!this.heroImageService) return;

    const attempts = uniqueImageUrlGroups([
      input.preferredImageUrls,
      input.fallbackImageUrls,
    ]);
    for (const [attemptIndex, imageUrls] of attempts.entries()) {
      if (imageUrls.length === 0) continue;
      try {
        const url = await this.heroImageService.generateColorGuideImage({
          organizationId: input.organizationId,
          productName: input.productName,
          category: input.category,
          description: input.description,
          options: input.options,
          ageGroup: input.ageGroup,
          imageUrls,
        });
        if (url) {
          processedImages[GENERATED_COLOR_GUIDE_IMAGE_KEY] = url;
          return;
        }
      } catch (error) {
        this.logger.warn(
          `detail color guide image attempt ${attemptIndex + 1} skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async generateKidsPlayfulSectionImages(
    input: {
      organizationId: string;
      parsed: DetailPageParsedGeneration;
      rawInput: DetailPageRawInput;
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

    if (input.rawInput.usageSectionMode !== 'exclude') {
      for (const [index, key] of GENERATED_USAGE_IMAGE_KEYS.slice(0, MAX_KIDS_PLAYFUL_USAGE_IMAGES).entries()) {
        const scenario = parsed.section3.scenarios[index];
        if (!scenario || scenario.imageIndex !== null || processedImages[key]) continue;
        try {
          const url = await this.heroImageService.generateUsageGuideImage({
            organizationId: input.organizationId,
            productName: input.rawInput.rawTitle,
            category: input.rawInput.rawCategory,
            description: input.rawInput.rawDescription,
            options: input.rawInput.rawOptions,
            ageGroup: input.rawInput.ageGroup,
            imageUrls: sourceImages,
            usageStep: scenario.caption,
            variant: index + 1,
          });
          if (url) processedImages[key] = url;
        } catch {
          // Generated usage images are best-effort; the section can still show text.
        }
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

    for (const [index, key] of GENERATED_DETAIL_IMAGE_KEYS.slice(0, MAX_KIDS_PLAYFUL_DETAIL_IMAGES).entries()) {
      if (processedImages[key]) continue;
      try {
        const url = await this.heroImageService.generateDetailCutImage({
          organizationId: input.organizationId,
          productName: input.rawInput.rawTitle,
          category: input.rawInput.rawCategory,
          description: input.rawInput.rawDescription,
          options: input.rawInput.rawOptions,
          ageGroup: input.rawInput.ageGroup,
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

  private async generateInto(
    processedImages: Record<string, string>,
    key: string,
    label: string,
    generate: () => Promise<string>,
  ): Promise<void> {
    try {
      const url = await generate();
      if (url) processedImages[key] = url;
    } catch (error) {
      this.logger.warn(
        `${label} skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function isPackageUsageStep(step: string): boolean {
  return /(포장|패키지|박스|상자|box|package|개봉|포장을\s*열|박스를\s*열|상자를\s*열)/iu.test(step);
}

function resolveEffectivePackageImageIndices(input: {
  packageLabel?: string;
  packageImageIndices?: number[];
  colorImageIndices?: number[];
  hookImageIndex?: number | null;
  imageUrls: string[];
}): number[] {
  if (!input.packageLabel?.trim()) return [];

  const packageIndices = uniqueImageIndices(input.packageImageIndices ?? [], input.imageUrls.length).slice(0, 3);
  if (packageIndices.length === 0) return [];

  const colorIndexSet = new Set(uniqueImageIndices(input.colorImageIndices ?? [], input.imageUrls.length));
  const nonColorPackageIndices = packageIndices.filter((index) => !colorIndexSet.has(index));
  if (nonColorPackageIndices.length === packageIndices.length) return packageIndices;

  if (
    Number.isInteger(input.hookImageIndex) &&
    input.hookImageIndex !== null &&
    input.hookImageIndex !== undefined &&
    packageIndices.includes(input.hookImageIndex)
  ) {
    return packageIndices;
  }

  if (nonColorPackageIndices.length > 0) return nonColorPackageIndices.slice(0, 3);

  const promotedHookIndex = uniqueImageIndices([input.hookImageIndex], input.imageUrls.length)
    .find((index) => !colorIndexSet.has(index) && looksLikePackageUrl(input.imageUrls[index] ?? ''));
  return promotedHookIndex === undefined ? packageIndices : [promotedHookIndex];
}

function uniqueImageIndices(indices: Array<number | null | undefined>, imageCount: number): number[] {
  const result: number[] = [];
  const seen = new Set<number>();
  for (const index of indices) {
    if (!Number.isInteger(index) || index === null || index === undefined) continue;
    if (index < 0 || index >= imageCount || seen.has(index)) continue;
    seen.add(index);
    result.push(index);
  }
  return result;
}

function looksLikePackageUrl(url: string): boolean {
  return /(box|package|packaging|pkg|retail|display|case|carton|boxed|박스|상자|패키지|포장|구성)/iu.test(url);
}

function buildNormalSectionSourcePolicy(
  parsed: DetailPageParsedGeneration,
  imageUrls: string[],
  excludedImageIndices: number[] = [],
): { blockedIndices: Set<number>; normalImageUrls: string[] } {
  const bold = parsed as Partial<BoldVerticalGeneration>;
  const blockedIndices = new Set<number>();
  for (const index of excludedImageIndices) {
    if (Number.isInteger(index)) blockedIndices.add(index);
  }
  const packageIndicesToBlock = resolveEffectivePackageImageIndices({
    packageLabel: bold.packageLabel,
    packageImageIndices: bold.packageImageIndices,
    colorImageIndices: bold.color?.imageIndices,
    hookImageIndex: bold.hook?.imageIndex,
    imageUrls,
  });
  for (const index of packageIndicesToBlock) {
    if (Number.isInteger(index)) blockedIndices.add(index);
  }
  for (const index of bold.safetyLabelImageIndices ?? []) {
    if (Number.isInteger(index)) blockedIndices.add(index);
  }
  imageUrls.forEach((url, index) => {
    if (isSafetyLabelImageUrl(url)) blockedIndices.add(index);
  });

  const normalImageUrls = pickSectionSourceImages([], imageUrls, blockedIndices);
  if (normalImageUrls.length > 0) {
    return { blockedIndices, normalImageUrls };
  }

  const safetyOnlyIndices = new Set<number>();
  for (const index of bold.safetyLabelImageIndices ?? []) {
    if (Number.isInteger(index)) safetyOnlyIndices.add(index);
  }
  imageUrls.forEach((url, index) => {
    if (isSafetyLabelImageUrl(url)) safetyOnlyIndices.add(index);
  });

  return {
    blockedIndices,
    normalImageUrls: pickSectionSourceImages([], imageUrls, safetyOnlyIndices),
  };
}

function pickSectionSourceImagesWithFallback(
  indices: number[],
  imageUrls: string[],
  sourcePolicy: { blockedIndices: Set<number>; normalImageUrls: string[] },
): string[] {
  const sectionImages = pickSectionSourceImages(
    indices,
    imageUrls,
    sourcePolicy.blockedIndices,
  );
  return sectionImages.length > 0 ? sectionImages : sourcePolicy.normalImageUrls;
}

function collectBoldHeroProductSourceIndices(parsed: BoldVerticalGeneration): number[] {
  return [
    ...(parsed.color?.imageIndices ?? []),
    ...(parsed.size?.imageIndices ?? []),
    ...(parsed.detailImageIndices ?? []),
  ].filter((index): index is number => Number.isInteger(index));
}

function pickPreferredSectionSourceImages(
  indices: number[],
  imageUrls: string[],
  excludedIndices: Set<number>,
): string[] {
  const preferred = Array.from(new Set(
    indices
      .filter((index) => Number.isInteger(index) && !excludedIndices.has(index))
      .map((index) => imageUrls[index])
      .filter((url): url is string => typeof url === 'string' && url.trim() !== ''),
  ));
  return preferred.length > 0
    ? preferred
    : pickSectionSourceImages([], imageUrls, excludedIndices);
}

function uniqueImageUrlGroups(groups: string[][]): string[][] {
  const result: string[][] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const urls = Array.from(new Set(group.filter((url) => url.trim() !== '')));
    if (urls.length === 0) continue;
    const key = urls.join('\n');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(urls);
  }
  return result;
}

function mergeImageUrlGroups(groups: string[][]): string[] {
  return Array.from(new Set(
    groups.flat().filter((url) => url.trim() !== ''),
  ));
}
