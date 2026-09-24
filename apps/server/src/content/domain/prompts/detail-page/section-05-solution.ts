/**
 * Section 5 — Solution
 *
 * Pain Points 를 받은 독자에게 "근데 이 제품은 다르다"로 전환.
 * 큰 헤드 2 줄 + 서브카피 3 줄 (Section 6 USP 미리보기) + 매력 이미지.
 *
 * ⚠ Section 5 의 subcopy 3 줄과 Section 6 의 USP 3 개는 의미적으로 1:1 매칭되어야
 * 하므로 → Section 5 → 6 chained call 권장 (Section 5 결과를 6 입력으로).
 */
import { z } from 'zod';

export const Section5Schema = z.object({
  /** 큰 헤드 line1 (4~8자, 핵심 솔루션 응축) */
  headlineLine1: z.string().min(2).max(100),
  /** 큰 헤드 line2 (5~10자, 결과/효과) */
  headlineLine2: z.string().min(2).max(100),
  /** 서브카피 정확히 3 줄 (각 8~14자, Section 6 USP 미리보기, 어법 통일) */
  subcopy: z.array(z.string().min(4).max(100)).length(3),
  /** 솔루션 이미지 (제품컷·사용씬 무관, 옵션/색상 비교 컷 제외) */
  imageIndex: z.number().int().nonnegative().nullable(),
});
