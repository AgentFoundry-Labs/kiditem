/**
 * Section 10 — Lifestyles / Attributes
 *
 * 보조 속성 3 개 (가벼움/조작/내구성/안전 등) 를 라이프스타일 카드 3 장으로.
 * 각 카드 = 작은 헤드 + 큰 헤드 2 줄 (마지막 단어 강조) + 라이프 이미지.
 */
import { z } from 'zod';

export const Section10Schema = z.object({
  cards: z
    .array(
      z.object({
        /** 작은 헤드 (5~10자) */
        smallHeadline: z.string().min(2).max(100),
        /** 큰 헤드 line1 (4~7자) */
        bigHeadlineLine1: z.string().min(2).max(100),
        /** 큰 헤드 line2 (2~5자, 컬러 강조) */
        bigHeadlineLine2: z.string().min(1).max(100),
        /** 라이프/사용씬 이미지. usedImageIndices 와 중복 X. 없으면 null. */
        imageIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .length(3),
});
