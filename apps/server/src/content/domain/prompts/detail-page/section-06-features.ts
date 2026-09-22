/**
 * Section 6 — Features
 *
 * Section 5 의 subcopy 3 줄과 1:1 매칭되는 USP 카드 3 장.
 * 카드 = "01"/"02"/"03" 번호 + USP 라벨 + 헤드 + 정사각 이미지.
 *
 * ⚠ Section 5 → 6 chain 호출. 5 의 subcopy 를 입력으로 받음.
 * 6 의 USP 3 개는 Section 7/8 의 입력이 됨 (KeyPoint 1 = USP[0], Blue Section = USP[1,2]).
 */
import { z } from 'zod';

export const Section6Schema = z.object({
  /** "[카테고리 단어] 특징" 4~6자 */
  label: z.string().min(3).max(100),
  /** 중간 톤 헤드 (8~14자, 느낌표 1회 OK) */
  headline: z.string().min(4).max(100),
  /** 큰 강조 헤드 (6~10자, 느낌표 강추) */
  bigHeadline: z.string().min(3).max(100),
  /** Feature 카드 정확히 3 장 */
  cards: z
    .array(
      z.object({
        /** "01" / "02" / "03" */
        num: z.string().regex(/^0[123]$/),
        /** 작은 회색 라벨 (USP 명사형, 5~8자) */
        title: z.string().min(2).max(100),
        /** 굵은 검은 헤드 (USP 본질, 4~7자) */
        subtitle: z.string().min(2).max(100),
        /** USP 를 가장 잘 보여주는 이미지 인덱스. 없으면 null. */
        imageIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .length(3),
});
