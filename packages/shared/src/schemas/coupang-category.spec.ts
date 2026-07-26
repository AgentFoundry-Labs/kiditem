import { describe, expect, it } from 'vitest';
import {
  CoupangCategorySuggestionRequestSchema,
  CoupangCategorySuggestionResponseSchema,
} from './coupang-category';

describe('Coupang category suggestion contract', () => {
  it('accepts a bounded list of product names', () => {
    expect(CoupangCategorySuggestionRequestSchema.parse({ names: ['물총'] })).toEqual({
      names: ['물총'],
    });
    expect(() => CoupangCategorySuggestionRequestSchema.parse({ names: [] })).toThrow();
  });

  it('represents an inferred category or an explicit null without a fallback', () => {
    const response = CoupangCategorySuggestionResponseSchema.parse({
      corpusSize: 1,
      results: [
        {
          name: '물총',
          suggestion: {
            categoryCell: '[77390] 완구/취미>스포츠/야외완구>물총',
            code: 77390,
            path: '완구/취미>스포츠/야외완구>물총',
            leaf: '물총',
            score: 0.9,
            confidence: 'high',
            basedOn: ['대형 물총'],
            support: 1,
          },
        },
        { name: '알 수 없는 상품', suggestion: null },
      ],
    });

    expect(response.results[0]?.suggestion?.code).toBe(77390);
    expect(response.results[1]?.suggestion).toBeNull();
  });
});
