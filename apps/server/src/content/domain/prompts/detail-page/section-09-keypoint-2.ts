/**
 * Section 9 — KeyPoint 2
 *
 * 메인 USP 3 개 외의 보조 셀링포인트 1 개 (그립/디자인/조작감/안전성/소재 등) 를
 * 다루는 자리. 텍스트 전용 (이미지 없음).
 */
import { z } from 'zod';

export const Section9Schema = z.object({
  /** "KeyPoint" 영문 고정 */
  tagText: z.literal('KeyPoint'),
  /** 작은 헤드 (8~14자, 사용 상황/배경 톤, 느낌표 1회 OK) */
  smallHeadline: z.string().min(4).max(100),
  /** 큰 헤드 정확히 3 줄 */
  bigHeadline: z.object({
    line1: z.string().min(2).max(100),
    line2: z.string().min(2).max(100),
    /** 핵심 명사. 컬러 강조됨. */
    line3: z.string().min(1).max(100),
  }),
  /** line3 의 강조 부분 (대개 line3 전체) */
  emphasisInLine3: z.string().min(1).max(100),
  /** 본문 정확히 2 줄 (각 12~18자, 어법 통일) */
  body: z.array(z.string().min(6).max(100)).length(2),
  /** 사용한 보조 셀링포인트 (Section 10 중복 회피용) */
  topic: z.string().min(2).max(100),
});
