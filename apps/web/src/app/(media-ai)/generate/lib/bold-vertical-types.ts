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
const GENERATED_SIZE_GUIDE_IMAGE_KEY = '__sizeGuideImage';
const GENERATED_COLOR_GUIDE_IMAGE_KEY = '__colorGuideImage';
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

  const heroImage = resolve(hook.imageIndex ?? firstProductImageIndex);
  const generatedHeroBanner = resolveGenerated(GENERATED_HERO_BANNER_KEY);
  const generatedSizeGuideImage = resolveGenerated(GENERATED_SIZE_GUIDE_IMAGE_KEY);
  const generatedColorGuideImage = resolveGenerated(GENERATED_COLOR_GUIDE_IMAGE_KEY);
  const generatedUsageImages = usageDisabled
    ? []
    : GENERATED_USAGE_IMAGE_KEYS
        .map((key) => resolveGenerated(key))
        .filter((url) => url !== '');
  const generatedDetailImages = GENERATED_DETAIL_IMAGE_KEYS
    .map((key) => resolveGenerated(key))
    .filter((url) => url !== '');
  const heroBanner = generatedHeroBanner;
  const heroProductImage = generatedSizeGuideImage || heroImage;
  const resolvedSizeImages = generatedSizeGuideImage ? [generatedSizeGuideImage] : [];
  const rawColorImages = resolveList(color.imageIndices);
  const resolvedColorImages = generatedColorGuideImage
    ? [generatedColorGuideImage]
    : rawColorImages;
  const rawUsageImages = usageDisabled ? [] : resolveList(usage.imageIndices);
  const resolvedUsageImages = generatedUsageImages.length > 0
    ? generatedUsageImages
    : rawUsageImages;
  const rawDetailImages = resolveList(detailImageIndices);
  const nonPackageSectionImageSet = new Set([
    ...resolvedSizeImages,
    generatedColorGuideImage,
    ...rawColorImages,
    ...resolvedUsageImages,
  ]);
  const resolvedPackageImages = generation.packageLabel?.trim()
    ? uniqueUrls(resolveList(generation.packageImageIndices))
      .filter((url) => !nonPackageSectionImageSet.has(url))
    : [];
  const packageImageSet = new Set(resolvedPackageImages);
  const nonSafetyProductImages = orderedImageUrls.filter((url) => (
    !safetyLabelImageSet.has(url) && !isSafetyLabelImageUrl(url)
  ));
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
  const resolvedDetailImages = uniqueUrls([
    ...generatedDetailImages,
    ...rawDetailImages,
    ...(generatedUsageImages.length > 0 ? [] : rawUsageImages),
  ]).filter((url) => !packageImageSet.has(url) && !safetyLabelImageSet.has(url));
  const finalDetailImages = resolvedDetailImages.length > 0
    ? resolvedDetailImages
    : fallbackDetailImages.filter((url) => !packageImageSet.has(url) && !safetyLabelImageSet.has(url));
  const descriptionLines = hook.description
    ? hook.description.split('\n').map((s) => s.trim()).filter(Boolean)
    : [];
  const productName = [hook.text, hook.titleSub]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[!?.]+$/g, '')
    .trim();
  const sectionSubtitleLines = productName
    ? [`${productName}의 상품정보 입니다.`, '아래의 제품정보를 확인해 주세요.']
    : (generation.section?.subtitle
        ? generation.section.subtitle.split('\n').map((s) => s.trim()).filter(Boolean)
        : []);

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
        return u ? [u] : [];
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
    detailPackageImages: resolvedPackageImages,
    detailPackageLabel: generation.packageLabel ?? '',
    safetyLabelImages,
    productInfo,
  };
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter((url) => url.trim() !== '')));
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
    if (/비눗|버블|bubble/i.test(name)) {
      return [
        '제품을 세워 잡고 전원을 켜세요',
        '입구가 얼굴을 향하지 않게 사용하세요',
        '사용 후 물기를 닦아 보관하세요',
      ];
    }
    if (/수제|왁스|말랑|주물럭|슬라임|촉감/i.test(name)) {
      return [
        '포장을 열고 제품 상태를 확인하세요',
        '손으로 가볍게 눌러 촉감을 즐기세요',
        '사용 후 먼지를 닦아 보관하세요',
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
