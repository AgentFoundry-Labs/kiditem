/**
 * Section 1 — Hero
 *
 * 상단 캐치프레이즈 + 제품 한국어명 + 히어로 이미지 인덱스.
 * 모든 후속 섹션이 koreanName / subhead 를 사용하므로 가장 먼저 호출.
 */
import { z } from 'zod';

export const Section1Schema = z.object({
  /** 캐치프레이즈 (8~12자). 카테고리에 맞게 LLM 자율. */
  subhead: z.string().min(4).max(100),
  /** 제품 한국어명 (6~12자). 한자/영어 직역 금지. 후속 모든 섹션이 사용. */
  mainHeadline: z.string().min(3).max(100),
  /** Hero 이미지 인덱스 (LLM-pick 모드). first 모드면 0 강제. */
  heroImageIndex: z.number().int().nonnegative().nullable(),
});

export type HeroImageMode = 'first' | 'llm-pick';
