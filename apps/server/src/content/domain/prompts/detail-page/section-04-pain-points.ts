/**
 * Section 4 — Pain Points
 *
 * "이 제품 안 사면 / 대체품 쓰면 생기는 문제" 섹션.
 * 상단 3 줄 카피 (작은-중간-큰 빨간) + 페인 카드 2~3 장 + 흑백 분위기 이미지.
 */
import { z } from 'zod';

export const Section4Schema = z.object({
  intro: z.object({
    /** 페인의 원인 (8~12자, "~라" 어미) */
    line1: z.string().min(4).max(100),
    /** 페인의 지속/심화 (8~12자) */
    line2: z.string().min(4).max(100),
    /** 페인의 결과를 합성어로 응축 (4~6자, 빨간 강조) */
    line3: z.string().min(2).max(100),
  }),
  cards: z
    .array(
      z.object({
        /** 회색 라벨 (14~18자, "..." 종결): 증상 설명 */
        title: z.string().min(6).max(100),
        /** 굵은 검은 헤드 (6~10자): 아픈 결과 압축 */
        subtitle: z.string().min(3).max(100),
      }),
    )
    .min(2)
    .max(3),
  /** 분위기 깔리는 이미지 (라이프/사용씬, 화이트백 X). 렌더 시 grayscale 적용. */
  moodImageIndex: z.number().int().nonnegative().nullable(),
});
