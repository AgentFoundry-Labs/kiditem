/**
 * BoldVerticalGeneration → DetailPageData.
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
const GENERATED_DETAIL_IMAGE_KEYS = ['__detailImage1', '__detailImage2', '__detailImage3'] as const;

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
  detailImageIndices: number[];
  packageImageIndices?: number[];
  packageLabel?: string;
  productInfo?: Array<{ key: string; value: string }>;
}

export function adaptBoldVerticalToDetailPageData(
  raw: BoldVerticalGeneration,
  imageUrls: string[],
  processedImages: Record<string, string> = {},
  apiBase: string = '',
): Partial<DetailPageData> {
  const orderedImageUrls = moveSafetyLabelImagesToEnd(imageUrls);
  const safetyLabelImages = orderedImageUrls.filter(isSafetyLabelImageUrl);
  const productInfo = safetyLabelImages.length > 0 ? [] : raw.productInfo ?? [];
  const resolve = (
    idx: number | null | undefined,
    options: { allowSafetyLabel?: boolean } = {},
  ): string => {
    if (idx === null || idx === undefined || idx < 0) return '';
    const processed = processedImages[String(idx)];
    const url = processed
      ? (processed.startsWith('http') ? processed : `${apiBase}${processed}`)
      : (idx < orderedImageUrls.length ? orderedImageUrls[idx] : '');
    if (!url || (!options.allowSafetyLabel && isSafetyLabelImageUrl(url))) return '';
    return url;
  };
  const resolveList = (indices: number[] | undefined): string[] =>
    (indices ?? []).map((i) => resolve(i)).filter((u) => u !== '');
  const resolveGenerated = (key: string): string => {
    const url = processedImages[key];
    if (!url) return '';
    return url.startsWith('http') ? url : `${apiBase}${url}`;
  };

  const heroImage = resolve(raw.hook.imageIndex);
  const generatedHeroBanner = resolveGenerated(GENERATED_HERO_BANNER_KEY);
  const generatedSizeGuideImage = resolveGenerated(GENERATED_SIZE_GUIDE_IMAGE_KEY);
  const generatedColorGuideImage = resolveGenerated(GENERATED_COLOR_GUIDE_IMAGE_KEY);
  const generatedDetailImages = GENERATED_DETAIL_IMAGE_KEYS
    .map((key) => resolveGenerated(key))
    .filter((url) => url !== '');
  const heroBanner = generatedHeroBanner;
  const heroProductImage = heroImage || generatedSizeGuideImage;
  const resolvedSizeImages = generatedSizeGuideImage
    ? [generatedSizeGuideImage]
    : [];
  const rawColorImages = resolveList(raw.color.imageIndices);
  const resolvedColorImages = generatedColorGuideImage
    ? [generatedColorGuideImage]
    : rawColorImages;
  const resolvedUsageImages = resolveList(raw.usage.imageIndices);
  const rawDetailImages = resolveList(raw.detailImageIndices);
  const primarySectionImages = new Set([
    heroProductImage,
    generatedSizeGuideImage,
    generatedColorGuideImage,
    ...rawColorImages,
    ...resolvedUsageImages,
  ].filter(Boolean));
  const nonRepeatedRawDetailImages = rawDetailImages.filter((url) => !primarySectionImages.has(url));
  const resolvedDetailImages = uniqueUrls([
    ...generatedDetailImages,
    ...(nonRepeatedRawDetailImages.length > 0 ? nonRepeatedRawDetailImages : rawDetailImages),
  ]);
  const resolvedPackageImages = uniqueUrls(resolveList(raw.packageImageIndices));
  const descriptionLines = raw.hook.description
    ? raw.hook.description.split('\n').map((s) => s.trim()).filter(Boolean)
    : [];
  const productName = [raw.hook.text, raw.hook.titleSub]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[!?.]+$/g, '')
    .trim();
  const sectionSubtitleLines = productName
    ? [`${productName}의 상품정보 입니다.`, '아래의 제품정보를 확인해 주세요.']
    : (raw.section?.subtitle
        ? raw.section.subtitle.split('\n').map((s) => s.trim()).filter(Boolean)
        : []);

  return {
    title: raw.hook.text,
    badge: raw.hook.subtext,
    hookText: raw.hook.text,
    hookTitleSub: raw.hook.titleSub ?? '',
    hookSubtext: raw.hook.subtext,
    description: descriptionLines,
    images: heroProductImage ? [heroProductImage] : [],
    heroBanner,
    sectionName: raw.section?.name ?? '',
    sectionTitle: raw.section?.title ?? '',
    sectionSubtitle: sectionSubtitleLines,
    keyPoints: raw.keyPoints.map((kp, i) => ({
      number: i + 1,
      title: kp.title,
      description: kp.description,
      images: (() => {
        const u = resolve(kp.imageIndex);
        return u ? [u] : [];
      })(),
    })),
    sizeTitle: '제품 사이즈 및 구성품',
    sizeSubtitle: productName ? `${productName}의 사이즈 및 구성품 안내 입니다.` : raw.size.subtitle,
    sizeGuideOverlay: raw.size.guideOverlay ?? true,
    sizeHeightLabel: raw.size.heightLabel ?? '',
    sizeWidthLabel: raw.size.widthLabel ?? '',
    sizeImages: resolvedSizeImages,
    colorSubtitle: raw.color.subtitle,
    colorImages: resolvedColorImages,
    usageSubtitle: raw.usage.subtitle,
    usageImages: resolvedUsageImages,
    detailText: '구성품 및 색상은 사진과 다를 수 있습니다',
    detailImages: resolvedDetailImages,
    detailPackageImages: resolvedPackageImages.filter((url) => resolvedDetailImages.includes(url)),
    detailPackageLabel: raw.packageLabel ?? '',
    safetyLabelImages,
    productInfo,
  };
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter((url) => url.trim() !== '')));
}
