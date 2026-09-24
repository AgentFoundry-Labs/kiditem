import { describe, expect, it } from 'vitest';
import {
  SALES_PRODUCT_TEXT_LIMITS,
  SalesProductDraftError,
  clampDraftText,
  planDraftOptions,
  requireConfirmedPrice,
} from './sales-product-draft';

const selling = (salePrice: number | null) => ({ id: `o-${salePrice ?? 'null'}`, supplyStatus: 'selling' as const, salePrice });

describe('requireConfirmedPrice', () => {
  it('값이 다 있는 판매 옵션을 판매가와 함께 돌려준다', () => {
    expect(requireConfirmedPrice({
      name: '테스트 상품',
      status: 'active',
      options: [selling(1000), { id: 'o-unused', supplyStatus: 'unused', salePrice: null }],
    })).toEqual([{ id: 'o-1000', salePrice: 1000 }]);
  });

  it('팔 옵션의 판매가가 하나라도 비면 한 가지 오류로 거절한다', () => {
    const reject = () => requireConfirmedPrice({
      name: '테스트 상품',
      status: 'active',
      options: [selling(1000), selling(null)],
    });
    expect(reject).toThrow(SalesProductDraftError);
    expect(reject).toThrow('판매가');
  });

  /**
   * 게이트는 가격만 묻는다(KID-313). 초안인지는 상태가 아니라 KID 가 말하고, 몰 엑셀은 값이 찬
   * 초안에 그 자리에서 KID 를 발급한다.
   */
  it('판매가가 다 찬 초안은 통과시킨다 — 초안인지는 가격 게이트가 묻지 않는다', () => {
    expect(requireConfirmedPrice({ name: '테스트 상품', status: 'draft', options: [selling(1000)] }))
      .toEqual([{ id: 'o-1000', salePrice: 1000 }]);
  });

  it('판매 옵션이 하나도 없으면 거절한다', () => {
    expect(() => requireConfirmedPrice({
      name: '테스트 상품',
      status: 'active',
      options: [{ id: 'o', supplyStatus: 'sold_out', salePrice: 1000 }],
    })).toThrow(SalesProductDraftError);
  });

  it('보관한 상품은 값이 차 있어도 보관이라고 말하며 거절한다', () => {
    const reject = () => requireConfirmedPrice({ name: '테스트 상품', status: 'archived', options: [selling(1000)] });
    expect(reject).toThrow(SalesProductDraftError);
    expect(reject).toThrow('보관');
  });
});

describe('planDraftOptions', () => {
  it('원천 옵션 이름이 있으면 한 단짜리 옵션을 만든다', () => {
    expect(planDraftOptions(['빨강', '파랑'])).toEqual({
      optionAxes: ['옵션'],
      optionValues: [['빨강'], ['파랑']],
    });
  });

  it('이름이 없으면 옵션 없는 단품 하나다', () => {
    expect(planDraftOptions([])).toEqual({ optionAxes: [], optionValues: [[]] });
    expect(planDraftOptions(undefined)).toEqual({ optionAxes: [], optionValues: [[]] });
  });

  it('몰이 거절하는 글자를 지우고, 빈 이름과 중복은 버린다', () => {
    expect(planDraftOptions(['빨강:S', ' 빨강S ', '  ', '파랑|L'])).toEqual({
      optionAxes: ['옵션'],
      optionValues: [['빨강S'], ['파랑L']],
    });
  });

  it('지우고 나서 남는 이름이 없으면 옵션 없는 단품으로 떨어진다', () => {
    expect(planDraftOptions([':', '|'])).toEqual({ optionAxes: [], optionValues: [[]] });
  });
});

describe('clampDraftText', () => {
  it('칸 너비를 넘는 원문은 그 너비로 자른다', () => {
    expect(clampDraftText('name', 'ㄱ'.repeat(300)))
      .toEqual({ value: 'ㄱ'.repeat(255), truncated: true });
    expect(clampDraftText('noticeCategory', '01234567890123'))
      .toEqual({ value: '0123456789', truncated: true });
  });

  it('너비 안의 값 · 빈 값은 그대로 둔다', () => {
    expect(clampDraftText('name', '수집 상품')).toEqual({ value: '수집 상품', truncated: false });
    expect(clampDraftText('brand', null)).toEqual({ value: null, truncated: false });
    expect(clampDraftText('brand', undefined)).toEqual({ value: null, truncated: false });
  });

  it('Prisma 가 잡아 둔 너비를 그대로 쓴다', () => {
    expect(SALES_PRODUCT_TEXT_LIMITS).toMatchObject({
      name: 255, brand: 50, manufacturer: 50, originCountry: 50,
      modelName: 60, modelNo: 60, importDeclarationNo: 60,
      standardCategory: 40, noticeCategory: 10, sourcePlatform: 40,
      targetAudience: 200, ageGroup: 100, productSize: 200,
    });
  });
});
