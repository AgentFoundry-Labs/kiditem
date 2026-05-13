import { describe, expect, it } from 'vitest';
import { getGenerateFormValidation, getGenerateSourceReferences } from './useGenerateForm';

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

describe('getGenerateSourceReferences', () => {
  it('reads sourcing candidates and target product from generate query params', () => {
    const params = new URLSearchParams(
      'sourceCandidateId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&sourceCandidateIds=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );

    expect(
      getGenerateSourceReferences(params, '22222222-2222-4222-8222-222222222222'),
    ).toEqual([
      {
        sourceType: 'sourcing_candidate',
        sourceCandidateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      {
        sourceType: 'sourcing_candidate',
        sourceCandidateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      {
        sourceType: 'master_product',
        masterId: '22222222-2222-4222-8222-222222222222',
      },
    ]);
  });
});
