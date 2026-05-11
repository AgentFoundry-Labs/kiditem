import { Injectable, Optional } from '@nestjs/common';
import { isSafetyLabelImageUrl, looksLikeSafetyLabelImage } from '../../domain/detail-page-image-order';
import { buildBoldVerticalProductTitle } from '../../domain/detail-page-product-title';
import type { BoldVerticalGeneration } from '../../domain/prompts/bold-vertical/single-call';
import {
  resolveDetailImageCountLimit,
  type DetailImageCount,
} from '../../domain/prompts/detail-page/types';
import {
  cleanImageIndices,
  colorPreference,
  extractSizeLabels,
  normalizeUsageGuide,
  packageKind,
  packagePreference,
  pickSectionSourceImages,
} from './detail-page-template-rules';
import type { DetailPageRawInput, DetailPageTemplateId } from './detail-page-ai.types';
import { DetailPageHeroImageService } from './detail-page-hero-image.service';

/**
 * Bold-vertical template refiner. Applies a fixed pipeline:
 *
 *   1. product title headings (hero / section / size labels)
 *   2. size fallbacks from raw description/options
 *   3. color image selection (heroImageService LLM)
 *   4. color subtitle (heroImageService LLM)
 *   5. detail-image ordering with package image inference
 *   6. package label fallbacks
 *   7. image selection rules (safety filter + index cleaning)
 *   8. product-info suppression when a safety label is present
 *
 * `suppressProductInfoWhenSafetyLabelExists` is exposed publicly because
 * `DetailPageQueryService` calls it on stored bold-vertical results that
 * did not go through this service's refine pipeline.
 *
 * `heroImageService` is optional — when absent (offline / test contexts)
 * color and package inference fall back to no-op so the rest of the
 * pipeline keeps working.
 */
@Injectable()
export class BoldVerticalRefinerService {
  constructor(
    @Optional()
    private readonly heroImageService?: DetailPageHeroImageService,
  ) {}

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
    return this.suppressProductInfoWhenSafetyLabelExists(
      withImageSelectionRules,
      'bold-vertical',
      rawInput.imageUrls,
      detectedSafetyLabelIndices,
    );
  }

  /**
   * Strips `productInfo` when the master has any safety-label image —
   * explicit indices on the parsed result, URL markers, or runtime
   * detection. Generic over `T` because it operates on the structural
   * `productInfo` slice common to bold-vertical-shaped results, including
   * stored rawInput records read by `DetailPageQueryService`.
   */
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

    const selected = parsed.detailImageIndices
      .map((imageIndex, detailPosition) => ({
        imageIndex,
        detailPosition,
        url: rawInput.imageUrls[imageIndex],
      }))
      .filter((item): item is { imageIndex: number; detailPosition: number; url: string } => (
        typeof item.url === 'string' && item.url.trim() !== ''
      ));

    const packagePositions = this.heroImageService && selected.length > 0
      ? await this.heroImageService.inferPackageImagePositions({
        imageUrls: selected.map((item) => item.url),
      }).catch(() => [])
      : [];

    const packageDetailPositions = new Set(
      packagePositions
        .map((position) => selected[position]?.detailPosition)
        .filter((position): position is number => Number.isInteger(position)),
    );
    const packageImageIndices = Array.from(new Set([
      ...(parsed.packageImageIndices ?? []),
      ...parsed.detailImageIndices.filter((_, position) => packageDetailPositions.has(position)),
    ]));
    const packageIndexSet = new Set(packageImageIndices);

    return {
      ...parsed,
      packageImageIndices,
      detailImageIndices: parsed.detailImageIndices.filter((imageIndex, position) => (
        !packageDetailPositions.has(position) && !packageIndexSet.has(imageIndex)
      )),
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
    const packageImageIndices = packageChoice === 'none'
      ? []
      : cleanVisibleIndices(parsed.packageImageIndices, 3);
    const packageSet = new Set(packageImageIndices);
    const detailImageLimit = resolveDetailImageCountLimit(rawInput.detailImageCount);
    const detailImageIndices = cleanVisibleIndices(parsed.detailImageIndices, rawInput.imageUrls.length)
      .filter((index) => !packageSet.has(index));
    const isNoColor = colorPreference(rawInput) === 'none';

    return {
      ...parsed,
      keyPoints: parsed.keyPoints.map((point) => ({
        ...point,
        imageIndex: point.imageIndex !== null &&
          point.imageIndex !== undefined &&
          !safetyIndices.has(point.imageIndex) &&
          point.imageIndex < rawInput.imageUrls.length
            ? point.imageIndex
            : null,
      })),
      size: {
        ...parsed.size,
        imageIndices: cleanVisibleIndices(parsed.size.imageIndices, 1),
      },
      color: {
        ...parsed.color,
        subtitle: isNoColor ? '' : parsed.color.subtitle,
        imageIndices: isNoColor ? [] : cleanVisibleIndices(parsed.color.imageIndices, 6),
      },
      usage: {
        ...parsed.usage,
        subtitle: normalizeUsageGuide(parsed.usage.subtitle, rawInput),
        imageIndices: cleanVisibleIndices(parsed.usage.imageIndices, 4),
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
}
