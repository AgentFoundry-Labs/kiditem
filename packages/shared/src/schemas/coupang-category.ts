import { z } from 'zod';

/**
 * 쿠팡 카테고리 추론 계약.
 *
 * `categoryCell` 은 WING 등록 폼이 요구하는 `[displayItemCategoryCode] 대>중>소` 원본 문자열이며,
 * 기존 `ChannelListing.category`(쿠팡 워크북 passthrough)와 동일한 형식이다.
 */
export const CoupangCategorySuggestionSchema = z
  .object({
    /** WING 폼에 그대로 넣는 값. 예) `[77390] 완구/취미>스포츠/야외완구>물총` */
    categoryCell: z.string().min(1),
    /** displayItemCategoryCode. 쿠팡 getCategories 응답 code 와 일치. */
    code: z.number().int().positive(),
    /** `완구/취미>스포츠/야외완구>물총` */
    path: z.string().min(1),
    /** 카테고리 검색창에 입력하는 마지막 조각. */
    leaf: z.string().min(1),
    /** 0..1 코퍼스 내 최고 유사도. */
    score: z.number().min(0).max(1),
    /**
     * high 만 기본값으로 채우고 그 외에는 수동 선택을 요구한다.
     * 실측(leave-one-out, n=300): high 76.9% / medium 52.7% / low 31.7%.
     */
    confidence: z.enum(['high', 'medium', 'low']),
    /** 판단 근거가 된 기존 노출상품명. */
    basedOn: z.array(z.string()).max(5),
    /** 해당 카테고리를 쓰는 기존 리스팅 수. */
    support: z.number().int().nonnegative(),
  })
  .strict();

export const CoupangCategorySuggestionRequestSchema = z
  .object({ names: z.array(z.string().min(1)).min(1).max(200) })
  .strict();

/** 확신이 없으면 `suggestion: null` — 호출부는 하드코딩 카테고리로 대체하지 않는다. */
export const CoupangCategorySuggestionResultSchema = z
  .object({
    name: z.string(),
    suggestion: CoupangCategorySuggestionSchema.nullable(),
  })
  .strict();

export const CoupangCategorySuggestionResponseSchema = z
  .object({
    /** 추론에 사용된 기존 리스팅 수. 0 이면 코퍼스가 비어 추론 자체가 불가능하다. */
    corpusSize: z.number().int().nonnegative(),
    results: z.array(CoupangCategorySuggestionResultSchema),
  })
  .strict();

export type CoupangCategorySuggestion = z.infer<typeof CoupangCategorySuggestionSchema>;
export type CoupangCategorySuggestionRequest = z.infer<typeof CoupangCategorySuggestionRequestSchema>;
export type CoupangCategorySuggestionResult = z.infer<typeof CoupangCategorySuggestionResultSchema>;
export type CoupangCategorySuggestionResponse = z.infer<typeof CoupangCategorySuggestionResponseSchema>;
