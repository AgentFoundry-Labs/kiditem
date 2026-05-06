/**
 * KidsPlayful 렌더용 데이터 타입.
 *
 * Endpoint 응답 (DetailPageGeneration, server zod schema) 을 받아 imageIndex 를
 * imageUrl 로 resolve 한 형. KidsPlayfulRenderer 가 직접 props 로 받는다.
 *
 * 나중에 packages/shared 로 옮길 수 있지만 일단 web 도메인 내부 타입.
 */
import {
  isSafetyLabelImageUrl,
  moveSafetyLabelImagesToEnd,
} from './detail-page-image-order';

const GENERATED_HERO_BANNER_KEY = '__heroBanner';

export interface KidsPlayfulData {
  section1: {
    subhead: string;
    mainHeadline: string;
    heroImageUrl: string | null;
  };
  section2: {
    reviews: Array<{
      usp: string;
      headline: string;
      body: string;
    }>;
  };
  section3: {
    label: string;
    headline: string;
    subhead: string;
    scenarios: Array<{
      caption: string;
      imageUrl: string | null;
    }>;
  };
  section4: {
    intro: { line1: string; line2: string; line3: string };
    cards: Array<{ title: string; subtitle: string }>;
    moodImageUrl: string | null;
  };
  section5: {
    headlineLine1: string;
    headlineLine2: string;
    subcopy: [string, string, string];
    imageUrl: string | null;
  };
  section6: {
    label: string;
    headline: string;
    bigHeadline: string;
    cards: Array<{
      num: string;
      title: string;
      subtitle: string;
      imageUrl: string | null;
    }>;
  };
  section7: {
    tagText: 'KeyPoint';
    headlineLine1: string;
    headlineLine2: string;
    emphasisInLine2: string;
    body1: string;
    body2: string;
    bodyEmphasis: string;
    imageUrl: string | null;
  };
  section8: {
    introLine1: string;
    introLine2: string;
    introLine3: string;
    blocks: Array<{
      pillLabel: string;
      headline: string;
      body: string;
      imageUrl: string | null;
    }>;
  };
  section9: {
    tagText: 'KeyPoint';
    smallHeadline: string;
    bigHeadline: { line1: string; line2: string; line3: string };
    emphasisInLine3: string;
    body: [string, string];
    topic: string;
  };
  section10: {
    cards: Array<{
      smallHeadline: string;
      bigHeadlineLine1: string;
      bigHeadlineLine2: string;
      imageUrl: string | null;
    }>;
  };
  section11: {
    galleryImageUrls: [string | null, string | null];
    symbolCard: { icon: string; text: string };
    closing: {
      body: [string, string];
      headline: [string, string];
    };
  };
  safetyLabelImageUrls: string[];
}

/** Server endpoint 의 raw 응답 형. Index 기반. */
export interface DetailPageGenerationRaw {
  section1: {
    subhead: string;
    mainHeadline: string;
    heroImageIndex: number | null;
  };
  section2: {
    reviews: Array<{ usp: string; headline: string; body: string }>;
  };
  section3: {
    label: string;
    headline: string;
    subhead: string;
    scenarios: Array<{ caption: string; imageIndex: number | null }>;
  };
  section4: {
    intro: { line1: string; line2: string; line3: string };
    cards: Array<{ title: string; subtitle: string }>;
    moodImageIndex: number | null;
  };
  section5: {
    headlineLine1: string;
    headlineLine2: string;
    subcopy: [string, string, string];
    imageIndex: number | null;
  };
  section6: {
    label: string;
    headline: string;
    bigHeadline: string;
    cards: Array<{
      num: string;
      title: string;
      subtitle: string;
      imageIndex: number | null;
    }>;
  };
  section7: {
    tagText: 'KeyPoint';
    headlineLine1: string;
    headlineLine2: string;
    emphasisInLine2: string;
    body1: string;
    body2: string;
    bodyEmphasis: string;
    imageIndex: number | null;
  };
  section8: {
    introLine1: string;
    introLine2: string;
    introLine3: string;
    blocks: Array<{
      pillLabel: string;
      headline: string;
      body: string;
      imageIndex: number | null;
    }>;
  };
  section9: {
    tagText: 'KeyPoint';
    smallHeadline: string;
    bigHeadline: { line1: string; line2: string; line3: string };
    emphasisInLine3: string;
    body: [string, string];
    topic: string;
  };
  section10: {
    cards: Array<{
      smallHeadline: string;
      bigHeadlineLine1: string;
      bigHeadlineLine2: string;
      imageIndex: number | null;
    }>;
  };
  section11: {
    galleryImageIndices: [number | null, number | null];
    symbolCard: { icon: string; text: string };
    closing: { body: [string, string]; headline: [string, string] };
  };
}

/**
 * Endpoint 응답의 imageIndex 들을 실제 URL 로 resolve.
 * 인덱스가 null 이거나 범위 초과면 imageUrl 은 null (KidsPlayfulRenderer 가 placeholder 처리).
 *
 * processedImages (백그라운드 누끼 결과) 가 있으면 그것 우선, 없으면 raw imageUrls.
 * processedImages 의 URL 은 server 의 `/api/processed/...` 라 absolute prefix 필요할 수도 →
 * 호출부에서 이미 absolute 형태로 넘겨도 되고 (apiBase + path), 또는 origin 을 prepend.
 */
export function adaptToKidsPlayful(
  raw: DetailPageGenerationRaw,
  imageUrls: string[],
  processedImages: Record<string, string> = {},
  apiBase: string = '',
): KidsPlayfulData {
  const orderedImageUrls = moveSafetyLabelImagesToEnd(imageUrls);
  const safetyLabelImageUrls = orderedImageUrls.filter(isSafetyLabelImageUrl);
  const resolve = (idx: number | null): string | null => {
    if (idx === null || idx < 0) return null;
    const processed = processedImages[String(idx)];
    const url = processed
      ? (processed.startsWith('http') ? processed : `${apiBase}${processed}`)
      : (idx < orderedImageUrls.length ? orderedImageUrls[idx] : null);
    if (!url || isSafetyLabelImageUrl(url)) return null;
    return url;
  };
  const resolveGenerated = (key: string): string | null => {
    const url = processedImages[key];
    if (!url) return null;
    return url.startsWith('http') ? url : `${apiBase}${url}`;
  };
  const generatedHeroBanner = resolveGenerated(GENERATED_HERO_BANNER_KEY);

  return {
    section1: {
      subhead: raw.section1.subhead,
      mainHeadline: raw.section1.mainHeadline,
      heroImageUrl: generatedHeroBanner ?? resolve(raw.section1.heroImageIndex),
    },
    section2: { reviews: raw.section2.reviews },
    section3: {
      label: raw.section3.label,
      headline: raw.section3.headline,
      subhead: raw.section3.subhead,
      scenarios: raw.section3.scenarios.map((s) => ({
        caption: s.caption,
        imageUrl: resolve(s.imageIndex),
      })),
    },
    section4: {
      intro: raw.section4.intro,
      cards: raw.section4.cards,
      moodImageUrl: resolve(raw.section4.moodImageIndex),
    },
    section5: {
      headlineLine1: raw.section5.headlineLine1,
      headlineLine2: raw.section5.headlineLine2,
      subcopy: raw.section5.subcopy,
      imageUrl: resolve(raw.section5.imageIndex),
    },
    section6: {
      label: raw.section6.label,
      headline: raw.section6.headline,
      bigHeadline: raw.section6.bigHeadline,
      cards: raw.section6.cards.map((c) => ({
        num: c.num,
        title: c.title,
        subtitle: c.subtitle,
        imageUrl: resolve(c.imageIndex),
      })),
    },
    section7: {
      tagText: raw.section7.tagText,
      headlineLine1: raw.section7.headlineLine1,
      headlineLine2: raw.section7.headlineLine2,
      emphasisInLine2: raw.section7.emphasisInLine2,
      body1: raw.section7.body1,
      body2: raw.section7.body2,
      bodyEmphasis: raw.section7.bodyEmphasis,
      imageUrl: resolve(raw.section7.imageIndex),
    },
    section8: {
      introLine1: raw.section8.introLine1,
      introLine2: raw.section8.introLine2,
      introLine3: raw.section8.introLine3,
      blocks: raw.section8.blocks.map((b) => ({
        pillLabel: b.pillLabel,
        headline: b.headline,
        body: b.body,
        imageUrl: resolve(b.imageIndex),
      })),
    },
    section9: raw.section9,
    section10: {
      cards: raw.section10.cards.map((c) => ({
        smallHeadline: c.smallHeadline,
        bigHeadlineLine1: c.bigHeadlineLine1,
        bigHeadlineLine2: c.bigHeadlineLine2,
        imageUrl: resolve(c.imageIndex),
      })),
    },
    section11: {
      galleryImageUrls: [
        resolve(raw.section11.galleryImageIndices[0]),
        resolve(raw.section11.galleryImageIndices[1]),
      ],
      symbolCard: raw.section11.symbolCard,
      closing: raw.section11.closing,
    },
    safetyLabelImageUrls,
  };
}
