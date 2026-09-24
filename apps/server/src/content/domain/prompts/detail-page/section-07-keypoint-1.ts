/**
 * Section 7 — KeyPoint 1
 *
 * Section 6 USP 3 개 중 USP[0] (= 가장 강력한 1번) 을 깊이 풀어주는 자리.
 * KeyPoint 영문 알약 + 큰 헤드 2 줄 + 본문 3 줄 + 큰 이미지.
 */
import { z } from 'zod';

export const Section7Schema = z.object({
  /** "KeyPoint" 영문 고정. 변경 금지. */
  tagText: z.literal('KeyPoint'),
  /** 큰 헤드 line1 (5~10자) */
  headlineLine1: z.string().min(2).max(100),
  /** 큰 헤드 line2 (5~10자, 마지막 핵심 단어가 컬러 강조됨) */
  headlineLine2: z.string().min(2).max(100),
  /** line2 안에서 컬러 강조될 단어/구절 (line2 의 부분 문자열) */
  emphasisInLine2: z.string().min(1).max(100),
  /** 본문 line1 (10~16자, USP 작동 원리) */
  body1: z.string().min(4).max(100),
  /** 본문 line2 (10~16자, 경쟁 대비 차이점) */
  body2: z.string().min(4).max(100),
  /** 본문 강조 (8~14자, 굵은 검은 결론) */
  bodyEmphasis: z.string().min(4).max(100),
  /** USP[0] 이 잘 보이는 라이프/사용씬 이미지 (라이프 우선, 화이트백도 OK) */
  imageIndex: z.number().int().nonnegative().nullable(),
});
