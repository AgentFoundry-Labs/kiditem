import { describe, expect, it } from 'vitest';
import { getGenerateFormValidation } from './useGenerateForm';

describe('getGenerateFormValidation', () => {
  it('requires at least one product image before generation', () => {
    expect(getGenerateFormValidation({ rawTitle: '자석 다트게임', imageCount: 0 })).toEqual({
      isValid: false,
      message: '상품 이미지를 최소 1장 추가해 주세요.',
    });
  });

  it('allows generation when title and one image are present', () => {
    expect(getGenerateFormValidation({ rawTitle: '자석 다트게임', imageCount: 1 })).toEqual({
      isValid: true,
      message: null,
    });
  });
});
