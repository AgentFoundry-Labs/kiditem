import { Injectable, Optional } from '@nestjs/common';
import { isSafetyLabelImageUrl, looksLikeSafetyLabelImage } from '../../domain/detail-page-image-order';
import { buildBoldVerticalProductTitle } from '../../domain/detail-page-product-title';
import type { BoldVerticalGeneration } from '../../domain/prompts/bold-vertical/single-call';
import type { DetailPageGeneration } from '../../domain/prompts/detail-page/single-call';
import {
  normalizeKcCertificationNumber,
  resolveDetailImageCountLimit,
  type DetailImageCount,
} from '../../domain/prompts/detail-page/types';
import {
  cleanImageIndices,
  colorPreference,
  extractSizeLabels,
  findSafetyLabelImageUrlIndices,
  normalizeUsageGuide,
  packageKind,
  packagePreference,
  pickSectionSourceImages,
  shouldInferPackageImages,
} from './detail-page-template-rules';
import type { DetailPageRawInput, DetailPageTemplateId, KidsPlayfulImageContext } from './detail-page-ai.types';
import { DetailPageHeroImageService } from './detail-page-hero-image.service';

@Injectable()
export class DetailPageResultRefinerService {
  constructor(
    @Optional()
    private readonly heroImageService?: DetailPageHeroImageService,
  ) {}

  async prepareKidsPlayfulImageContext(input: {
    templateId: DetailPageTemplateId;
    rawInput: Pick<DetailPageRawInput, 'rawDescription' | 'rawOptions' | 'imageUrls'>;
  }): Promise<KidsPlayfulImageContext> {
    if (input.templateId !== 'kids-playful') {
      return {
        packageImageIndices: new Set<number>(),
        safetyLabelImageIndices: new Set<number>(),
      };
    }

    const packageImageIndices = await this.inferKidsPackageImageIndices(input.rawInput);
    return {
      packageImageIndices,
      safetyLabelImageIndices: findSafetyLabelImageUrlIndices(input.rawInput.imageUrls),
    };
  }

  applyKidsPlayfulImageSelectionRules(
    parsed: DetailPageGeneration,
    rawInput: { imageUrls: string[]; usageSectionMode?: 'include' | 'exclude' },
    context?: KidsPlayfulImageContext,
  ): DetailPageGeneration {
    const packageImageIndices = new Set(context?.packageImageIndices ?? []);
    const safetyLabelImageIndices = new Set([
      ...(context?.safetyLabelImageIndices ?? []),
      ...findSafetyLabelImageUrlIndices(rawInput.imageUrls),
    ]);
    const blockedIndices = new Set<number>([
      ...packageImageIndices,
      ...safetyLabelImageIndices,
    ]);
    const usedNormal = new Set<number>();

    const isAvailable = (value: number | null | undefined): value is number => (
      Number.isInteger(value) &&
      value !== null &&
      value !== undefined &&
      value >= 0 &&
      value < rawInput.imageUrls.length &&
      !blockedIndices.has(value)
    );
    const claim = (value: number | null | undefined): number | null => {
      if (!isAvailable(value) || usedNormal.has(value)) return null;
      usedNormal.add(value);
      return value;
    };
    const claimFirstRemaining = (): number | null => {
      for (let index = 0; index < rawInput.imageUrls.length; index += 1) {
        if (!isAvailable(index) || usedNormal.has(index)) continue;
        usedNormal.add(index);
        return index;
      }
      return null;
    };

    const section1HeroImageIndex = claim(parsed.section1.heroImageIndex) ?? claimFirstRemaining();
    const section3Scenarios = parsed.section3.scenarios.map((scenario) => ({
      ...scenario,
      imageIndex: claim(scenario.imageIndex),
    }));
    const section4MoodImageIndex = claim(parsed.section4.moodImageIndex);
    const section5ImageIndex = claim(parsed.section5.imageIndex);
    const section6Cards = parsed.section6.cards.map((card) => ({
      ...card,
      imageIndex: claim(card.imageIndex),
    }));
    const section7ImageIndex = claim(parsed.section7.imageIndex);
    const section8Blocks = parsed.section8.blocks.map((block) => ({
      ...block,
      imageIndex: claim(block.imageIndex),
    }));
    const section10Cards = parsed.section10.cards.map((card) => ({
      ...card,
      imageIndex: claim(card.imageIndex),
    }));

    const galleryFirstCandidate = parsed.section11.galleryImageIndices[0];
    const gallerySecondCandidate = parsed.section11.galleryImageIndices[1];
    const galleryFirst = claim(galleryFirstCandidate) ?? claimFirstRemaining();
    const packageGallery = [...packageImageIndices].find((index) => (
      Number.isInteger(index) &&
      index >= 0 &&
      index < rawInput.imageUrls.length &&
      !safetyLabelImageIndices.has(index)
    ));
    const gallerySecond = packageGallery ?? claim(gallerySecondCandidate) ?? claimFirstRemaining();

    return {
      ...parsed,
      usageEnabled: rawInput.usageSectionMode !== 'exclude',
      section1: {
        ...parsed.section1,
        heroImageIndex: section1HeroImageIndex,
      },
      section3: {
        ...parsed.section3,
        scenarios: section3Scenarios,
      },
      section4: {
        ...parsed.section4,
        moodImageIndex: section4MoodImageIndex,
      },
      section5: {
        ...parsed.section5,
        imageIndex: section5ImageIndex,
      },
      section6: {
        ...parsed.section6,
        cards: section6Cards,
      },
      section7: {
        ...parsed.section7,
        imageIndex: section7ImageIndex,
      },
      section8: {
        ...parsed.section8,
        blocks: section8Blocks,
      },
      section10: {
        ...parsed.section10,
        cards: section10Cards,
      },
      section11: {
        ...parsed.section11,
        galleryImageIndices: [galleryFirst, gallerySecond],
      },
    };
  }

  async refineBoldVerticalGeneration(
    parsed: BoldVerticalGeneration,
    rawInput: DetailPageRawInput,
  ): Promise<BoldVerticalGeneration> {
    const withProductTitleHeadings = this.applyBoldVerticalProductTitleHeadings(
      parsed,
      rawInput.rawTitle,
    );
    const withSizeFallbacks = this.applyBoldVerticalSizeFallbacks(
      withProductTitleHeadings,
      rawInput,
    );
    const withColorImages = await this.refineBoldVerticalColorImages(
      withSizeFallbacks,
      rawInput,
    );
    const withColorSubtitle = await this.refineBoldVerticalColorSubtitle(
      withColorImages,
      rawInput,
    );
    const withDetailImageOrder = await this.refineBoldVerticalDetailImageOrder(
      withColorSubtitle,
      rawInput,
    );
    const withPackageLabel = this.applyBoldVerticalPackageLabelFallbacks(
      withDetailImageOrder,
      rawInput,
    );
    const detectedSafetyLabelIndices = await this.detectSafetyLabelImageIndices(
      rawInput.imageUrls,
    );
    const withImageSelectionRules = this.applyBoldVerticalImageSelectionRules(
      withPackageLabel,
      rawInput,
      detectedSafetyLabelIndices,
    );
    const withUsagePreference = this.applyBoldVerticalUsagePreference(
      withImageSelectionRules,
      rawInput,
    );
    const withProductInfoFallbacks = this.applyBoldVerticalProductInfoFallbacks(
      withUsagePreference,
      rawInput,
    );
    return this.suppressProductInfoWhenSafetyLabelExists(
      withProductInfoFallbacks,
      'bold-vertical',
      rawInput.imageUrls,
      detectedSafetyLabelIndices,
    );
  }

  suppressProductInfoWhenSafetyLabelExists<T>(
    result: T,
    templateId: DetailPageTemplateId,
    imageUrls: string[],
    detectedSafetyLabelIndices?: Set<number>,
  ): T {
    if (templateId !== 'bold-vertical') return result;
    if (!result || typeof result !== 'object') return result;
    const explicitSafetyIndices = (result as { safetyLabelImageIndices?: unknown }).safetyLabelImageIndices;
    const hasExplicitSafety = Array.isArray(explicitSafetyIndices) && explicitSafetyIndices.length > 0;
    const hasSafetyLabel = imageUrls.some(isSafetyLabelImageUrl) ||
      (detectedSafetyLabelIndices?.size ?? 0) > 0 ||
      hasExplicitSafety;
    if (!hasSafetyLabel) return result;
    if (!Array.isArray((result as { productInfo?: unknown }).productInfo)) return result;

    return {
      ...(result as Record<string, unknown>),
      productInfo: [],
    } as T;
  }

  private async detectSafetyLabelImageIndices(imageUrls: string[]): Promise<Set<number>> {
    const result = new Set<number>();
    await Promise.all(imageUrls.map(async (url, index) => {
      if (isSafetyLabelImageUrl(url)) {
        result.add(index);
        return;
      }
      const buffer = await this.fetchImageForSafetyDetection(url);
      if (!buffer) return;
      try {
        if (await looksLikeSafetyLabelImage(buffer)) result.add(index);
      } catch {
        // Safety detection is best-effort; URL markers and LLM fields still apply.
      }
    }));
    return result;
  }

  private async fetchImageForSafetyDetection(url: string): Promise<Buffer | null> {
    if (url.startsWith('data:image/')) {
      const [, encoded] = url.split(',', 2);
      if (!encoded) return null;
      try {
        return Buffer.from(encoded, 'base64');
      } catch {
        return null;
      }
    }
    if (!/^https?:\/\//i.test(url)) return null;
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (hostname === 'example.com' || hostname.endsWith('.example.com')) return null;
    } catch {
      return null;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !contentType.toLowerCase().startsWith('image/')) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async inferKidsPackageImageIndices(rawInput: {
    rawDescription?: string;
    rawOptions?: string;
    imageUrls: string[];
  }): Promise<Set<number>> {
    const result = new Set<number>();
    if (packagePreference(rawInput) === 'none') return result;
    if (!this.heroImageService || rawInput.imageUrls.length === 0) return result;
    if (!shouldInferPackageImages(rawInput)) return result;

    try {
      const indices = await this.heroImageService.inferPackageImagePositions({
        imageUrls: rawInput.imageUrls,
      });
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= rawInput.imageUrls.length) continue;
        result.add(index);
      }
    } catch {
      // Package classification is best-effort; prompt-level hints still help when available.
    }
    return result;
  }

  private applyBoldVerticalProductTitleHeadings(
    parsed: BoldVerticalGeneration,
    rawTitle: string,
  ): BoldVerticalGeneration {
    const title = buildBoldVerticalProductTitle(rawTitle);
    if (!title) return parsed;

    const productInfo = (parsed.productInfo ?? []).map((info) => (
      info.key.includes('제품명') ? { ...info, value: title.plainTitle } : info
    ));

    return {
      ...parsed,
      hook: {
        ...parsed.hook,
        subtext: title.heroSubtext ?? parsed.hook.subtext,
        text: title.first,
        titleSub: title.second,
        description: title.heroDescription ?? parsed.hook.description,
      },
      section: {
        ...parsed.section,
        name: title.first,
        title: title.second,
        subtitle: title.sectionSubtitle ?? parsed.section.subtitle,
      },
      size: {
        ...parsed.size,
        subtitle: parsed.size.subtitle || `${title.plainTitle}의 사이즈 안내 입니다.`,
      },
      productInfo,
    };
  }

  private applyBoldVerticalSizeFallbacks(
    parsed: BoldVerticalGeneration,
    rawInput: { rawDescription: string; rawOptions: string },
  ): BoldVerticalGeneration {
    const labels = extractSizeLabels(`${rawInput.rawOptions}\n${rawInput.rawDescription}`);
    return {
      ...parsed,
      size: {
        ...parsed.size,
        guideOverlay: true,
        heightLabel: parsed.size.heightLabel || labels.heightLabel,
        widthLabel: parsed.size.widthLabel || labels.widthLabel,
      },
    };
  }

  private async refineBoldVerticalColorSubtitle(
    parsed: BoldVerticalGeneration,
    rawInput: DetailPageRawInput,
  ): Promise<BoldVerticalGeneration> {
    if (colorPreference(rawInput) === 'none') return this.applyBoldVerticalNoColor(parsed);
    if (!this.heroImageService) return parsed;
    try {
      const subtitle = await this.heroImageService.inferColorSubtitle({
        productName: rawInput.rawTitle,
        category: rawInput.rawCategory,
        description: rawInput.rawDescription,
        options: rawInput.rawOptions,
        imageUrls: pickSectionSourceImages(parsed.color?.imageIndices ?? [], rawInput.imageUrls),
      });
      return this.applyBoldVerticalColorSubtitle(parsed, subtitle);
    } catch {
      return parsed;
    }
  }

  private async refineBoldVerticalColorImages(
    parsed: BoldVerticalGeneration,
    rawInput: DetailPageRawInput,
  ): Promise<BoldVerticalGeneration> {
    if (colorPreference(rawInput) === 'none') return this.applyBoldVerticalNoColor(parsed);
    if (!this.heroImageService) return parsed;
    try {
      const imageIndices = await this.heroImageService.inferColorImageSelection({
        productName: rawInput.rawTitle,
        category: rawInput.rawCategory,
        description: rawInput.rawDescription,
        options: rawInput.rawOptions,
        imageUrls: rawInput.imageUrls,
      });
      if (imageIndices.length === 0) return parsed;
      return {
        ...parsed,
        color: {
          ...parsed.color,
          imageIndices,
        },
      };
    } catch {
      return parsed;
    }
  }

  private applyBoldVerticalColorSubtitle(
    parsed: BoldVerticalGeneration,
    subtitle: string,
  ): BoldVerticalGeneration {
    const colorSubtitle = subtitle.trim();
    if (!colorSubtitle) return parsed;
    const productInfo = (parsed.productInfo ?? []).map((info) => (
      info.key.includes('색상') ? { ...info, value: colorSubtitle } : info
    ));
    return {
      ...parsed,
      color: {
        ...parsed.color,
        subtitle: colorSubtitle,
      },
      productInfo,
    };
  }

  private applyBoldVerticalNoColor(parsed: BoldVerticalGeneration): BoldVerticalGeneration {
    return {
      ...parsed,
      color: {
        ...parsed.color,
        subtitle: '',
        imageIndices: [],
      },
      productInfo: (parsed.productInfo ?? []).filter((info) => !info.key.includes('색상')),
    };
  }

  private async refineBoldVerticalDetailImageOrder(
    parsed: BoldVerticalGeneration,
    rawInput: { rawDescription?: string; rawOptions?: string; imageUrls: string[] },
  ): Promise<BoldVerticalGeneration> {
    if (packagePreference(rawInput) === 'none') {
      return { ...parsed, packageImageIndices: [], packageLabel: '' };
    }

    const inferredPackageImageIndices = this.heroImageService && shouldInferPackageImages(rawInput)
      ? await this.heroImageService.inferPackageImagePositions({
        imageUrls: rawInput.imageUrls,
      }).catch(() => [])
      : [];
    const highConfidencePackageImageIndices = Array.from(new Set([
      ...inferredPackageImageIndices,
    ])).filter((index) => (
      Number.isInteger(index) &&
      index >= 0 &&
      index < rawInput.imageUrls.length
    ));
    const packageImageIndices = Array.from(new Set([
      ...(highConfidencePackageImageIndices.length > 0
        ? highConfidencePackageImageIndices
        : (parsed.packageImageIndices ?? [])),
    ])).filter((index) => (
      Number.isInteger(index) &&
      index >= 0 &&
      index < rawInput.imageUrls.length
    ));
    const packageIndexSet = new Set(packageImageIndices);

    return {
      ...parsed,
      packageImageIndices,
      detailImageIndices: parsed.detailImageIndices.filter((imageIndex) => (
        !packageIndexSet.has(imageIndex)
      )),
      usage: {
        ...parsed.usage,
        imageIndices: parsed.usage.imageIndices.filter((imageIndex) => (
          !packageIndexSet.has(imageIndex)
        )),
      },
    };
  }

  private applyBoldVerticalPackageLabelFallbacks(
    parsed: BoldVerticalGeneration,
    rawInput: { rawTitle: string; rawDescription: string; rawOptions: string },
  ): BoldVerticalGeneration {
    if (packagePreference(rawInput) === 'none') {
      return {
        ...parsed,
        packageImageIndices: [],
        packageLabel: '',
      };
    }
    const packageImageIndices = parsed.packageImageIndices ?? [];
    if (packageImageIndices.length === 0) {
      return {
        ...parsed,
        packageImageIndices: [],
        packageLabel: '',
      };
    }
    if (parsed.packageLabel?.trim()) return parsed;

    const raw = `${rawInput.rawTitle}\n${rawInput.rawDescription}\n${rawInput.rawOptions}`;
    const kind = packageKind(rawInput);
    const count = raw.match(/(\d+)\s*(?:개입|개\s*입|pcs|PCS|ea|EA|입)/u)?.[1];
    const setCount = raw.match(/(\d+)\s*(?:종|개)\s*세트/u)?.[1];
    const plainCount = raw.match(/(?:1박스\s*수량|세트\s*수량)\s*:\s*(\d+)/u)?.[1];
    if (kind === 'box') {
      return {
        ...parsed,
        packageLabel: count || plainCount ? `1박스 ${count || plainCount}개입 구성` : '박스 구성',
      };
    }
    if (kind === 'set') {
      return {
        ...parsed,
        packageLabel: setCount
          ? `${setCount}종 세트 구성`
          : plainCount
            ? `${plainCount}개 세트 구성`
            : '세트 구성',
      };
    }
    if (count && /box|BOX|박스|패키지|포장/u.test(raw)) {
      return {
        ...parsed,
        packageLabel: `1박스 ${count}개입 구성`,
      };
    }
    if (setCount) {
      return {
        ...parsed,
        packageLabel: `${setCount}종 세트 구성`,
      };
    }
    if (/box|BOX|박스|패키지|포장/u.test(raw)) {
      return {
        ...parsed,
        packageLabel: '박스 구성',
      };
    }
    return {
      ...parsed,
      packageLabel: '세트 구성',
    };
  }

  private applyBoldVerticalImageSelectionRules(
    parsed: BoldVerticalGeneration,
    rawInput: {
      rawDescription: string;
      rawOptions: string;
      imageUrls: string[];
      detailImageCount?: DetailImageCount;
    },
    detectedSafetyLabelIndices: Set<number> = new Set(),
  ): BoldVerticalGeneration {
    const urlSafetyIndices = new Set(
      rawInput.imageUrls
        .map((url, index) => ({ url, index }))
        .filter(({ url }) => isSafetyLabelImageUrl(url))
        .map(({ index }) => index),
    );
    const explicitSafetyLabelImageIndices = [
      ...(parsed.safetyLabelImageIndices ?? []),
      ...Array.from(urlSafetyIndices),
      ...Array.from(detectedSafetyLabelIndices),
    ];
    const safetyLabelImageIndices = cleanImageIndices(
      explicitSafetyLabelImageIndices,
      rawInput.imageUrls.length,
      8,
    );
    const safetyIndices = new Set(safetyLabelImageIndices);
    const cleanVisibleIndices = (indices: number[] | undefined, max: number): number[] => {
      const seen = new Set<number>();
      const result: number[] = [];
      for (const index of indices ?? []) {
        if (!Number.isInteger(index) || index < 0 || index >= rawInput.imageUrls.length) continue;
        if (safetyIndices.has(index) || seen.has(index)) continue;
        seen.add(index);
        result.push(index);
        if (result.length >= max) break;
      }
      return result;
    };
    const packageChoice = packagePreference(rawInput);
    const rawPackageImageIndices = packageChoice === 'none'
      ? []
      : cleanVisibleIndices(parsed.packageImageIndices, 3);
    const packageImageIndices = resolveEffectivePackageImageIndices({
      packageLabel: parsed.packageLabel,
      packageImageIndices: rawPackageImageIndices,
      colorImageIndices: parsed.color.imageIndices,
      hookImageIndex: parsed.hook.imageIndex,
      imageUrls: rawInput.imageUrls,
    });
    const packageSet = new Set(packageImageIndices);
    const blockedNormalImageIndices = new Set([
      ...safetyIndices,
      ...packageSet,
    ]);
    const cleanNormalIndices = (indices: number[] | undefined, max: number): number[] => (
      cleanVisibleIndices(indices, max).filter((index) => !packageSet.has(index))
    );
    const cleanNormalIndex = (index: number | null | undefined): number | null => (
      index !== null &&
      index !== undefined &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < rawInput.imageUrls.length &&
      !blockedNormalImageIndices.has(index)
        ? index
        : null
    );
    const detailImageLimit = resolveDetailImageCountLimit(rawInput.detailImageCount);
    const detailImageIndices = cleanVisibleIndices(parsed.detailImageIndices, rawInput.imageUrls.length)
      .filter((index) => !packageSet.has(index));
    const isNoColor = colorPreference(rawInput) === 'none';

    return {
      ...parsed,
      hook: {
        ...parsed.hook,
        imageIndex: cleanNormalIndex(parsed.hook.imageIndex),
        bannerImageIndex: cleanNormalIndex(parsed.hook.bannerImageIndex),
      },
      keyPoints: parsed.keyPoints.map((point) => ({
        ...point,
        imageIndex: cleanNormalIndex(point.imageIndex),
      })),
      size: {
        ...parsed.size,
        imageIndices: cleanNormalIndices(parsed.size.imageIndices, 1),
      },
      color: {
        ...parsed.color,
        subtitle: isNoColor ? '' : parsed.color.subtitle,
        imageIndices: isNoColor ? [] : cleanNormalIndices(parsed.color.imageIndices, 6),
      },
      usage: {
        ...parsed.usage,
        subtitle: normalizeUsageGuide(parsed.usage.subtitle, rawInput),
        imageIndices: cleanNormalIndices(parsed.usage.imageIndices, 4),
      },
      detailImageIndices: detailImageIndices.slice(0, detailImageLimit),
      packageImageIndices,
      packageLabel: packageImageIndices.length > 0 ? parsed.packageLabel : '',
      safetyLabelImageIndices,
      productInfo: isNoColor
        ? (parsed.productInfo ?? []).filter((info) => !info.key.includes('색상'))
        : parsed.productInfo,
    };
  }

  private applyBoldVerticalUsagePreference(
    parsed: BoldVerticalGeneration,
    rawInput: { usageSectionMode?: 'include' | 'exclude' },
  ): BoldVerticalGeneration {
    if (rawInput.usageSectionMode !== 'exclude') {
      return parsed;
    }
    return {
      ...parsed,
      usageEnabled: false,
      usage: {
        ...parsed.usage,
        subtitle: '',
        imageIndices: [],
      },
    };
  }

  private applyBoldVerticalProductInfoFallbacks(
    parsed: BoldVerticalGeneration,
    rawInput: Pick<DetailPageRawInput, 'kcCertificationStatus' | 'kcCertificationNumber'>,
  ): BoldVerticalGeneration {
    const productInfo = parsed.productInfo ?? [];
    if (rawInput.kcCertificationStatus === 'none') {
      return {
        ...parsed,
        productInfo: productInfo.filter((info) => !isKcCertificationInfoKey(info.key)).slice(0, 7),
      };
    }

    const kcNumber = normalizeKcCertificationNumber(rawInput.kcCertificationNumber);
    if (!kcNumber) {
      return {
        ...parsed,
        productInfo: productInfo.slice(0, 7),
      };
    }

    const withoutKc = productInfo.filter((info) => !isKcCertificationInfoKey(info.key));
    return {
      ...parsed,
      productInfo: [
        ...withoutKc.slice(0, 6),
        { key: 'KC 인증번호', value: kcNumber },
      ],
    };
  }
}

function isKcCertificationInfoKey(key: string): boolean {
  return /(?:^|\s)(?:KC|케이씨)\s*(?:인증|번호)?|인증번호/u.test(key);
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
