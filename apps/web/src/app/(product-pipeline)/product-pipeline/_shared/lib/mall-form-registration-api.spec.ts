import { describe, expect, it } from 'vitest';
import type { MallProductDraft } from './mall-product-draft';
import { checkedMallForm } from './mall-form-registration-api';

function draft(overrides: Partial<MallProductDraft> = {}): MallProductDraft {
  return {
    candidateId: 'c1',
    displayName: '킬러볼 스피너 키링',
    sellerProductName: '킬러볼 스피너 키링',
    brand: '키드아이템',
    maker: '거영I&D',
    keywords: ['키링'],
    representativeImageUrl: 'https://cdn.test/main.jpg',
    additionalImageUrls: [],
    detailImageUrls: ['https://cdn.test/detail.jpg'],
    notice: { category: '아동용품', fields: { 품명및모델명: '킬러볼 스피너 키링' } },
    variants: [{
      options: [],
      salePrice: 2280,
      listPrice: 2280,
      stock: 10,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.test/main.jpg',
    }],
    sourceCategory: null,
    ...overrides,
  };
}

const form = { url: 'https://item.esmplus.com/goods/new', manualSteps: [] };

describe('checkedMallForm — 등록 실행 scope의 폼 지시', () => {
  it('초안이 차 있으면 빌더의 폼 지시를 그대로 돌려준다', () => {
    expect(checkedMallForm(draft(), form)).toBe(form);
  });

  it('⭐ 초안이 비어 있으면 폼 지시를 만들지 않는다 — 반쯤 빈 폼은 사람이 그대로 제출한다', () => {
    expect(() => checkedMallForm(draft({ detailImageUrls: [] }), form)).toThrow('등록 준비가 끝나지 않았습니다');
  });
});
