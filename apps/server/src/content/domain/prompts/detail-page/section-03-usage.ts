/**
 * Section 3 — Usage 200%
 *
 * 카테고리 적응 라벨 ("[키워드] 200%") + 메인 헤드 + 서브 + 시나리오 카드 2~3 장.
 * 각 카드 = 와이드 이미지 1장 + 오버레이 카피 1줄.
 */
import { z } from 'zod';

export const Section3Schema = z.object({
  /** "[키워드] 200%" 패턴 라벨 */
  label: z.string().min(4).max(100),
  /** 메인 헤드 (8~14자, 느낌표 1회 OK) */
  headline: z.string().min(4).max(100),
  /** 서브카피 (10~16자) */
  subhead: z.string().min(4).max(100),
  /** 활용 시나리오 카드 2~3 개 */
  scenarios: z
    .array(
      z.object({
        /** 오버레이 카피 (12~20자, 임팩트) */
        caption: z.string().min(6).max(100),
        /** 라이프/사용씬 이미지 인덱스. 화이트백 제외. 없으면 null. */
        imageIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .min(2)
    .max(3),
});
