/**
 * Section 11 — Gallery / Conclusion
 *
 * 상세 마지막. 갤러리 이미지 2 장 + 카테고리별 브랜드 심볼 카드 + 마무리 카피.
 */
import { z } from 'zod';

/** 카테고리별 lucide-react 아이콘 매핑. 매핑 안 되면 Sparkles 기본. */
const SUPPORTED_LUCIDE_ICONS = [
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
