/**
 * Section 2 — Reviews
 *
 * "찐 사용 후기" 4 장 카드 — 별 5개 + headline (5~10자) + body (10~15자).
 * USP 4 개를 추출 → 후기 카피로 변환 (1:1).
 */
import { z } from 'zod';

export const Section2Schema = z.object({
  reviews: z
    .array(
      z.object({
        /** USP 라벨 (사거리/대용량/내구성 등). 카드 4 장이 서로 다른 USP. */
        usp: z.string().min(2).max(100),
        /** 큰 헤드 (5~10자, 느낌표 OK) */
        headline: z.string().min(2).max(100),
        /** 작은 본문 (10~15자, 이유/근거) */
        body: z.string().min(4).max(100),
      }),
    )
    .length(4),
});
