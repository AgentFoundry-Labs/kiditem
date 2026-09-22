/**
 * Section 8 — Blue Section Details
 *
 * 파란 배경 안에서 USP[1] + USP[2] 를 각각 큰 블록으로 풀어줌. (USP[0] 은 Section 7 차지)
 * 인트로 3 줄 (작은-중간-제품명) + 블록 2 개 (각 알약/헤드/본문/이미지).
 *
 * ⚠ Section 1 의 subhead 와 koreanName, Section 6 의 USP[1,2], 누적 usedImageIndices 입력.
 */
import { z } from 'zod';

export const Section8Schema = z.object({
  /** 인트로: USP 들을 통합한 짧은 카피 (8~14자) */
  introLine1: z.string().min(4).max(100),
  /** 인트로: Section 1 의 subhead 그대로 재사용 */
  introLine2: z.string().min(4).max(100),
  /** 인트로: 제품 한국어명 그대로 재사용 */
  introLine3: z.string().min(3).max(100),
  /** 정확히 2 블록. 0 = USP[1], 1 = USP[2] */
  blocks: z
    .array(
      z.object({
        /** "0{N}. {USP 명사형}" (예: "01. 압축펌프") */
        pillLabel: z.string().min(4).max(100),
        /** 큰 흰 헤드 (5~14자, 1~2줄. 줄바꿈은 \n) */
        headline: z.string().min(2).max(100),
        /** 옅은 파랑 톤 본문 (16~32자, 1~2줄. 줄바꿈은 \n) */
        body: z.string().min(8).max(100),
        /** USP 를 잘 보여주는 이미지. usedImageIndices 와 중복 X. 없으면 null. */
        imageIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .length(2),
});
