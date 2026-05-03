/**
 * Section 11 — Gallery / Conclusion
 *
 * 상세 마지막. 갤러리 이미지 2 장 + 카테고리별 브랜드 심볼 카드 + 마무리 카피.
 */
import { z } from 'zod';
import {
  formatImageCandidates,
  formatUsedIndices,
  type RawProductInput,
} from './types';

/** 카테고리별 lucide-react 아이콘 매핑. 매핑 안 되면 Sparkles 기본. */
export const SUPPORTED_LUCIDE_ICONS = [
  'Waves',
  'Sparkles',
  'Pencil',
  'ToyBrick',
  'Heart',
  'Car',
  'Book',
  'Activity',
] as const;

export const Section11Schema = z.object({
  /** 갤러리 이미지 2 장 (앞·뒤). 부족하면 null 슬롯 허용. */
  galleryImageIndices: z.tuple([
    z.number().int().nonnegative().nullable(),
    z.number().int().nonnegative().nullable(),
  ]),
  /** 카테고리별 브랜드/심볼 카드 */
  symbolCard: z.object({
    /** lucide-react 아이콘 이름 */
    icon: z.enum(SUPPORTED_LUCIDE_ICONS),
    /** 영문 대문자 (3~12자) */
    text: z
      .string()
      .min(3)
      .max(20)
      .regex(/^[A-Z][A-Z\s]*$/),
  }),
  /** 마무리 카피 */
  closing: z.object({
    /** 본문 정확히 2 줄 (각 10~16자, 자랑/요약 톤) */
    body: z.array(z.string().min(4).max(100)).length(2),
    /** 큰 헤드 정확히 2 줄 (각 4~10자, 마무리, 느낌표 1회 OK) */
    headline: z.array(z.string().min(2).max(100)).length(2),
  }),
});
export type Section11Output = z.infer<typeof Section11Schema>;

export interface Section11Input {
  raw: RawProductInput;
  koreanName: string;
  /** 이전 섹션이 사용한 이미지 인덱스 (중복 회피) */
  usedImageIndices: number[];
}

export const SECTION_11_SYSTEM = `너는 한국 쿠팡 상세페이지 카피라이터다. 상세 마지막 자리에서
갤러리 이미지 + 브랜드 심볼 카드 + 마무리 카피를 만든다.

규칙:
1. 출력은 JSON 만.
2. galleryImageIndices: raw 이미지 중 "가장 매력적인 라이프/사용씬 컷"
   2 장 (앞·뒤). usedImageIndices 와 중복 X. 부족하면 null 슬롯 허용.
3. symbolCard.icon: 카테고리에 맞는 lucide-react 아이콘 이름 (다음 중 하나)
   - 물총/물놀이 → "Waves"
   - 슬라임 → "Sparkles"
   - 문구 → "Pencil"
   - 완구 일반 → "ToyBrick"
   - 인형/플러시 → "Heart"
   - 차량/탈것 → "Car"
   - 도서 → "Book"
   - 운동/스포츠 → "Activity"
   - 매핑 안 되면 "Sparkles" 기본
4. symbolCard.text: 영문 대문자 (3~12자, 카테고리 그대로)
   "WATER GUN", "SLIME", "STATIONERY", "TOY", "DOLL", "CAR", "BOOK", "SPORTS"
5. closing.body: 정확히 2 줄. 각 10~16자. 자랑/요약 톤.
6. closing.headline: 정확히 2 줄. 각 4~10자. 큰 마무리, 느낌표 1회 OK.

좋은 예시:
{
  "galleryImageIndices": [22, 25],
  "symbolCard": { "icon": "Waves", "text": "WATER GUN" },
  "closing": {
    "body": ["더블샷으로 두 줄 발사!", "대용량으로 오래 즐겨요"],
    "headline": ["여름 물놀이,", "더 강력하게!"]
  }
}`;

export function buildSection11User(input: Section11Input): string {
  const { raw, koreanName, usedImageIndices } = input;
  return `Gallery / Conclusion 섹션을 만들어라.

제품명: ${koreanName}
카테고리: ${raw.rawCategory}
이미지 후보 (인덱스: URL):
${formatImageCandidates(raw.imageUrls)}
이미 사용된 이미지 인덱스 (중복 회피): ${formatUsedIndices(usedImageIndices)}

JSON 으로만 출력 (필드: galleryImageIndices[2], symbolCard, closing).`;
}
