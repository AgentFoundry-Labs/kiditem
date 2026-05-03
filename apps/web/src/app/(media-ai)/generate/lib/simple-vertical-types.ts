/**
 * SimpleVerticalGeneration → DetailPageData (BoldVertical 템플릿 호환).
 *
 * 사용자 요청: AGENT row 같은 풍부한 BoldVertical 스타일 렌더 → SV LLM 이 hook (2-color),
 * section, keyPoints, productInfo 등 풍부한 필드 출력 → 어댑터가 imageIndex resolve 후
 * Partial<DetailPageData> 로 BoldVertical 템플릿에 그대로 입력.
 */
import type { DetailPageData } from '@kiditem/templates';

export interface SimpleVerticalGeneration {
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
  size: { subtitle: string; imageIndices: number[] };
  color: { subtitle: string; imageIndices: number[] };
  usage: { subtitle: string; imageIndices: number[] };
  detailImageIndices: number[];
  productInfo?: Array<{ key: string; value: string }>;
}

/**
 * SimpleVerticalGeneration + 입력 imageUrls + processedImages → Partial<DetailPageData>.
 *
 * - imageIndex / imageIndices 를 실제 URL 로 resolve
 * - processedImages (백그라운드 누끼/lifestyle) 가 있으면 그것 우선
 * - hookText / hookTitleSub / heroBanner / sectionName 등 BoldVertical 필드 매핑
 * - keyPoints[].number 는 1, 2, 3 자동 할당
 */
export function adaptSimpleVerticalToDetailPageData(
  raw: SimpleVerticalGeneration,
  imageUrls: string[],
  processedImages: Record<string, string> = {},
  apiBase: string = '',
): Partial<DetailPageData> {
  const resolve = (idx: number | null | undefined): string => {
    if (idx === null || idx === undefined || idx < 0) return '';
    const processed = processedImages[String(idx)];
    if (processed) {
      return processed.startsWith('http') ? processed : `${apiBase}${processed}`;
    }
    return idx < imageUrls.length ? imageUrls[idx] : '';
  };
  const resolveList = (indices: number[] | undefined): string[] =>
    (indices ?? []).map((i) => resolve(i)).filter((u) => u !== '');

  const heroImage = resolve(raw.hook.imageIndex);
  const heroBanner = resolve(raw.hook.bannerImageIndex);

  // description: \n 으로 split → string[] (BoldVertical 이 줄별 렌더)
  const descriptionLines = raw.hook.description
    ? raw.hook.description.split('\n').map((s) => s.trim()).filter(Boolean)
    : [];
  const sectionSubtitleLines = raw.section?.subtitle
    ? raw.section.subtitle.split('\n').map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    title: raw.hook.text,
    badge: raw.hook.subtext,
    hookText: raw.hook.text,
    hookTitleSub: raw.hook.titleSub ?? '',
    hookSubtext: raw.hook.subtext,
    description: descriptionLines,
    images: heroImage ? [heroImage] : [],
    heroBanner: heroBanner || (heroImage ?? ''),
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
    sizeSubtitle: raw.size.subtitle,
    sizeImages: resolveList(raw.size.imageIndices),
    colorSubtitle: raw.color.subtitle,
    colorImages: resolveList(raw.color.imageIndices),
    detailImages: resolveList(raw.detailImageIndices),
    productInfo: raw.productInfo ?? [],
  };
}
