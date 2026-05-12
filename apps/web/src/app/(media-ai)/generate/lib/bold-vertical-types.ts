/**
 * BoldVerticalGeneration -> DetailPageData.
 *
 * KIDITEM DESIGN 은 BoldVertical 템플릿을 사용한다. LLM 은 hook/section/
 * keyPoints/productInfo 같은 중간 필드를 만들고, 이 어댑터가 imageIndex 를
 * 실제 URL 로 resolve 해서 DetailPageData 로 변환한다.
 */
import type { DetailPageData } from '@kiditem/templates';
import {
  isSafetyLabelImageUrl,
  moveSafetyLabelImagesToEnd,
} from './detail-page-image-order';

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

export interface BoldVerticalGeneration {
  hook: {
    subtext: string;
    text: string;
    titleSub?: string;
    description: string;
    imageIndex: number | null;
    bannerImageIndex?: number | null;
  };
  section?: {
    name: string;
    title: string;
    subtitle: string;
  };
  keyPoints: Array<{
    title: string;
    description: string;
    imageIndex: number | null;
  }>;
  size: {
    subtitle: string;
    heightLabel?: string;
    widthLabel?: string;
    guideOverlay?: boolean;
    imageIndices: number[];
  };
  color: { subtitle: string; imageIndices: number[] };
  usage: { subtitle: string; imageIndices: number[] };
  usageEnabled?: boolean;
  detailImageIndices: number[];
  packageImageIndices?: number[];
  packageLabel?: string;
  safetyLabelImageIndices?: number[];
  productInfo?: Array<{ key: string; value: string }>;
}

export function adaptBoldVerticalToDetailPageData(
  raw: Partial<BoldVerticalGeneration> | null | undefined,
  imageUrls: string[],
  processedImages: Record<string, string> = {},
  apiBase: string = '',
): Partial<DetailPageData> {
  const orderedImageUrls = moveSafetyLabelImagesToEnd(imageUrls);
  const generation = raw ?? {};
  const hook = generation.hook ?? {
    subtext: '',
    text: '',
    titleSub: '',
    description: '',
    imageIndex: null,
  };
  const keyPoints = generation.keyPoints ?? [];
  const size = generation.size ?? { subtitle: '', imageIndices: [] };
  const color = generation.color ?? { subtitle: '', imageIndices: [] };
  const usage = generation.usage ?? { subtitle: '', imageIndices: [] };
  const usageDisabled = generation.usageEnabled === false;
  const detailImageIndices = generation.detailImageIndices ?? [];
  const explicitSafetyIndexSet = new Set(generation.safetyLabelImageIndices ?? []);
  const resolve = (
    idx: number | null | undefined,
    options: { allowSafetyLabel?: boolean } = {},
  ): string => {
    if (idx === null || idx === undefined || idx < 0) return '';
    const processed = processedImages[String(idx)];
    const url = processed
      ? (processed.startsWith('http') ? processed : `${apiBase}${processed}`)
      : (idx < orderedImageUrls.length ? orderedImageUrls[idx] : '');
    if (!url || (!options.allowSafetyLabel && (explicitSafetyIndexSet.has(idx) || isSafetyLabelImageUrl(url)))) {
      return '';
    }
    return url;
  };
  const resolveList = (
    indices: number[] | undefined,
    options: { allowSafetyLabel?: boolean } = {},
  ): string[] => (indices ?? []).map((i) => resolve(i, options)).filter((u) => u !== '');
  const resolveGenerated = (key: string): string => {
    const url = processedImages[key];
    if (!url) return '';
    return url.startsWith('http') ? url : `${apiBase}${url}`;
  };
  const firstProductImageIndex = orderedImageUrls.findIndex(
    (url) => !isSafetyLabelImageUrl(url),
  );
  const explicitSafetyLabelImages = uniqueUrls(
    resolveList(generation.safetyLabelImageIndices, { allowSafetyLabel: true }),
  );
  const safetyLabelImages = uniqueUrls([
    ...explicitSafetyLabelImages,
    ...orderedImageUrls.filter(isSafetyLabelImageUrl),
  ]);
  const safetyLabelImageSet = new Set(safetyLabelImages);
  const productInfo = safetyLabelImages.length > 0 ? [] : generation.productInfo ?? [];
  const productName = [hook.text, hook.titleSub]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[!?.]+$/g, '')
    .trim();
  const descriptionLines = normalizeHeroDescriptionLines(
    hook.description
      ? hook.description.split('\n').map((s) => s.trim()).filter(Boolean)
      : [],
    productName,
  );
  const sectionSubtitleLines = productName
    ? [`${productName}의 상품정보 입니다.`, '아래의 제품정보를 확인해 주세요.']
    : (generation.section?.subtitle
        ? generation.section.subtitle.split('\n').map((s) => s.trim()).filter(Boolean)
        : []);

  const heroImage = resolve(hook.imageIndex ?? firstProductImageIndex);
  const generatedHeroBanner = resolveGenerated(GENERATED_HERO_BANNER_KEY);
  const generatedHeroProductImage = resolveGenerated(GENERATED_HERO_PRODUCT_IMAGE_KEY);
  const generatedSizeGuideImage = resolveGenerated(GENERATED_SIZE_GUIDE_IMAGE_KEY);
  const generatedColorGuideImage = resolveGenerated(GENERATED_COLOR_GUIDE_IMAGE_KEY);
  const generatedPackageGuideImage = resolveGenerated(GENERATED_PACKAGE_GUIDE_IMAGE_KEY);
  const generatedUsageImagesByStep = usageDisabled
    ? []
    : GENERATED_USAGE_IMAGE_KEYS.map((key) => resolveGenerated(key));
  const generatedDetailImages = GENERATED_DETAIL_IMAGE_KEYS
    .map((key) => resolveGenerated(key))
    .filter((url) => url !== '');
  const heroBanner = generatedHeroBanner;
  const effectivePackageImageIndices = resolveEffectivePackageImageIndices({
    packageLabel: generation.packageLabel,
    packageImageIndices: generation.packageImageIndices,
    colorImageIndices: color.imageIndices,
    hookImageIndex: hook.imageIndex,
    imageCount: orderedImageUrls.length,
    imageUrls: orderedImageUrls,
  });
  const initialPackageImages = generation.packageLabel?.trim()
    ? uniqueUrls(resolveList(effectivePackageImageIndices))
    : [];
  const initialPackageImageSet = new Set(initialPackageImages);
  const colorCandidateImages = uniqueUrls(resolveList(color.imageIndices))
    .filter((url) => !safetyLabelImageSet.has(url) && !isSafetyLabelImageUrl(url));
  const colorCandidateImageSet = new Set(colorCandidateImages);
  const rawColorImages = colorCandidateImages.filter((url) => !initialPackageImageSet.has(url));
  const allPackageImages = generatedPackageGuideImage
    ? [generatedPackageGuideImage]
    : initialPackageImages.slice(0, 1);
  const packageImageSet = new Set(allPackageImages);
  const normalizedUsageSubtitle = usageDisabled ? '' : normalizeUsageGuide(usage.subtitle, productName);
  const rawUsageImagesByStep = usageDisabled
    ? []
    : resolveList(usage.imageIndices).filter((url) => !packageImageSet.has(url));
  const usageSteps = usageGuideSteps(normalizedUsageSubtitle);
  const rawUsageImages = rawUsageImagesByStep.filter((url, index) => (
    !isPackageOnlyUsageStep(usageSteps[index] ?? '', allPackageImages.length > 0)
  ));
  const nonSafetyProductImages = orderedImageUrls.filter((url) => (
    !safetyLabelImageSet.has(url) && !isSafetyLabelImageUrl(url)
  ));
  const rawUsageImageSet = new Set(rawUsageImages);
  const nonColorProductImages = nonSafetyProductImages.filter((url) => (
    !colorCandidateImageSet.has(url) &&
    !packageImageSet.has(url) &&
    !rawUsageImageSet.has(url)
  ));
  const heroProductFallbackImage = uniqueUrls([
    ...nonColorProductImages,
    heroImage,
    ...nonSafetyProductImages,
    ...rawColorImages,
  ]).find((url) => (
    !packageImageSet.has(url) &&
    !safetyLabelImageSet.has(url)
  )) ?? '';
  const heroProductImage = generatedHeroProductImage || heroProductFallbackImage;
  const resolvedSizeImages = generatedSizeGuideImage ? [generatedSizeGuideImage] : [];
  const colorFallbackImages = color.subtitle.trim()
    ? uniqueUrls(nonSafetyProductImages.filter((url) => !packageImageSet.has(url))).slice(0, 1)
    : [];
  const resolvedColorImages = generatedColorGuideImage
    ? [generatedColorGuideImage]
    : rawColorImages.length > 0
      ? rawColorImages
      : colorFallbackImages;
  const rawDetailImages = resolveList(detailImageIndices)
    .filter((url) => !packageImageSet.has(url));
  const usageStepCount = countUsageGuideSteps(normalizedUsageSubtitle);
  const usageFillCandidates = uniqueUrls([
    ...rawUsageImages,
    ...nonSafetyProductImages.filter((url) => !packageImageSet.has(url)),
  ]);
  const resolvedUsageImages = usageDisabled
    ? []
    : fillUsageImageSlots(generatedUsageImagesByStep, usageFillCandidates, usageStepCount);
  const primarySectionImages = new Set([
    heroProductImage,
    generatedSizeGuideImage,
    generatedColorGuideImage,
    ...rawColorImages,
    ...resolvedUsageImages,
  ].filter(Boolean));
  const fallbackDetailImages = uniqueUrls([
    ...nonSafetyProductImages.filter((url) => !primarySectionImages.has(url)),
    ...rawUsageImages,
    heroProductImage,
    ...nonSafetyProductImages,
  ]).slice(0, 6);
  const requestedDetailImageCount = Math.min(
    6,
    Math.max(detailImageIndices.length, generatedDetailImages.length),
  );
  const resolvedDetailImages = uniqueUrls([
    ...generatedDetailImages,
    ...rawDetailImages,
    ...((generatedDetailImages.length > 0 || rawDetailImages.length > 0 || generatedUsageImagesByStep.some(Boolean))
      ? []
      : rawUsageImages),
  ]).filter((url) => !packageImageSet.has(url) && !safetyLabelImageSet.has(url));
  const finalDetailImages = resolvedDetailImages.length > 0
    ? resolvedDetailImages.slice(0, requestedDetailImageCount > 0 ? requestedDetailImageCount : 6)
    : fallbackDetailImages.filter((url) => !packageImageSet.has(url) && !safetyLabelImageSet.has(url));

  return {
    title: hook.text,
    badge: hook.subtext,
    hookText: hook.text,
    hookTitleSub: hook.titleSub ?? '',
    hookSubtext: hook.subtext,
    description: descriptionLines,
    images: heroProductImage ? [heroProductImage] : [],
    heroBanner,
    sectionName: generation.section?.name ?? '',
    sectionTitle: generation.section?.title ?? '',
    sectionSubtitle: sectionSubtitleLines,
    keyPoints: keyPoints.map((kp, i) => ({
      number: i + 1,
      title: kp.title,
      description: kp.description,
      images: (() => {
        const u = resolve(kp.imageIndex);
        return u && !packageImageSet.has(u) ? [u] : [];
      })(),
    })),
    sizeTitle: '제품 사이즈 및 구성품',
    sizeSubtitle: productName ? `${productName}의 사이즈 및 구성품 안내 입니다.` : size.subtitle,
    sizeGuideOverlay: size.guideOverlay ?? true,
    sizeHeightLabel: size.heightLabel ?? '',
    sizeWidthLabel: size.widthLabel ?? '',
    sizeImages: resolvedSizeImages,
    colorSubtitle: color.subtitle,
    colorImages: resolvedColorImages,
    usageSubtitle: usageDisabled ? '' : normalizeUsageGuide(usage.subtitle, productName),
    usageImages: resolvedUsageImages,
    detailText: '구성품 및 색상은 사진과 다를 수 있습니다',
    detailImages: finalDetailImages.slice(0, 6),
    detailPackageImages: allPackageImages,
    detailPackageLabel: generation.packageLabel ?? '',
    safetyLabelImages,
    productInfo,
  };
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter((url) => url.trim() !== '')));
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

function resolveEffectivePackageImageIndices(input: {
  packageLabel?: string;
  packageImageIndices?: number[];
  colorImageIndices?: number[];
  hookImageIndex?: number | null;
  imageCount: number;
  imageUrls: string[];
}): number[] {
  if (!input.packageLabel?.trim()) return [];

  const packageIndices = uniqueImageIndices(input.packageImageIndices ?? [], input.imageCount).slice(0, 3);
  if (packageIndices.length === 0) return [];

  const colorIndexSet = new Set(uniqueImageIndices(input.colorImageIndices ?? [], input.imageCount));
  const nonColorPackageIndices = packageIndices.filter((index) => !colorIndexSet.has(index));
  const hasColorCollision = nonColorPackageIndices.length < packageIndices.length;
  if (!hasColorCollision) return packageIndices;

  if (
    Number.isInteger(input.hookImageIndex) &&
    input.hookImageIndex !== null &&
    input.hookImageIndex !== undefined &&
    packageIndices.includes(input.hookImageIndex)
  ) {
    return packageIndices;
  }

  if (nonColorPackageIndices.length > 0) return nonColorPackageIndices.slice(0, 3);

  const promotedHookIndex = uniqueImageIndices([input.hookImageIndex], input.imageCount)
    .find((index) => !colorIndexSet.has(index) && looksLikePackageUrl(input.imageUrls[index] ?? ''));
  return promotedHookIndex === undefined ? packageIndices : [promotedHookIndex];
}

function looksLikePackageUrl(url: string): boolean {
  return /(box|package|packaging|pkg|retail|display|case|carton|boxed|박스|상자|패키지|포장|구성)/iu.test(url);
}

function normalizeHeroDescriptionLines(lines: string[], productName: string): string[] {
  const copy = lines.join(' ').trim();
  if (
    /슬라임|말랑|촉감|주물럭|왁스팝/u.test(productName) &&
    /(비눗방울|자동\s*버블|목에\s*걸)/u.test(copy)
  ) {
    return ['쫀득하게 주무르며 즐기는 슬라임!'];
  }
  return lines;
}

function countUsageGuideSteps(value: string): number {
  return usageGuideSteps(value)
    .slice(0, GENERATED_USAGE_IMAGE_KEYS.length)
    .length;
}

function usageGuideSteps(value: string): string[] {
  return value
    .split(/\n|(?:^|\s)(?=\d+[.)]\s*)/u)
    .map((line) => line.replace(/^\d+[.)]\s*/u, '').trim())
    .filter(Boolean);
}

function isPackageOnlyUsageStep(step: string, hasPackageSection: boolean): boolean {
  return hasPackageSection &&
    /(포장|패키지|박스|상자|box|package|개봉|포장을\s*열|박스를\s*열|상자를\s*열)/iu.test(step);
}

function fillUsageImageSlots(
  generatedImagesByStep: string[],
  fallbackImages: string[],
  usageStepCount: number,
): string[] {
  const limit = Math.min(
    GENERATED_USAGE_IMAGE_KEYS.length,
    usageStepCount || GENERATED_USAGE_IMAGE_KEYS.length,
  );
  const used = new Set(generatedImagesByStep.filter(Boolean));
  let fallbackCursor = 0;

  return Array.from({ length: limit }, (_, index) => {
    const generated = generatedImagesByStep[index];
    if (generated) return generated;

    while (
      fallbackCursor < fallbackImages.length &&
      used.has(fallbackImages[fallbackCursor])
    ) {
      fallbackCursor += 1;
    }
    const fallback = fallbackImages[fallbackCursor] ?? '';
    if (fallback) {
      used.add(fallback);
      fallbackCursor += 1;
    }
    return fallback;
  }).filter((url) => url.trim() !== '');
}

function normalizeUsageGuide(value: string, productName: string): string {
  const lines = value
    .split(/\n|(?:^|\s)(?=\d+[.)]\s*)/u)
    .map((line) => line.replace(/^\d+[.)]\s*/u, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  if (lines.length >= 2) {
    return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
  }

  const name = productName.trim();
  const fallback = (() => {
    if (/수제|왁스|말랑|주물럭|슬라임|촉감/i.test(name)) {
      return [
        '포장을 열고 제품 상태를 확인하세요',
        '손으로 가볍게 눌러 촉감을 즐기세요',
        '사용 후 먼지를 닦아 보관하세요',
      ];
    }
    if (/비눗|버블|bubble/i.test(name)) {
      return [
        '제품을 세워 잡고 전원을 켜세요',
        '입구가 얼굴을 향하지 않게 사용하세요',
        '사용 후 물기를 닦아 보관하세요',
      ];
    }
    return [
      '포장을 열고 제품 상태를 확인하세요',
      '보호자 확인 후 알맞게 사용하세요',
      '사용 후 깨끗하게 정리해 보관하세요',
    ];
  })();

  return [
    ...lines,
    ...fallback.filter((line) => !lines.includes(line)),
  ].slice(0, 3).map((line, index) => `${index + 1}. ${line}`).join('\n');
}
