import { describe, expect, it } from 'vitest';
import {
  SALES_PRODUCT_TEXT_LIMITS,
  SalesProductDraftError,
  clampDraftText,
  planDraftOptions,
  requireConfirmedPrice,
  resolveSalesProductStatus,
} from './sales-product-draft';

const selling = (salePrice: number | null) => ({ id: `o-${salePrice ?? 'null'}`, supplyStatus: 'selling' as const, salePrice });

describe('resolveSalesProductStatus', () => {
  it('판매 옵션 하나라도 판매가가 비면 draft 다', () => {
    expect(resolveSalesProductStatus({ current: 'active', options: [selling(1000), selling(null)] })).toBe('draft');
  });

  it('판매 옵션이 모두 값을 가지면 active 로 올라간다', () => {
    expect(resolveSalesProductStatus({ current: 'draft', options: [selling(1000), selling(2000)] })).toBe('active');
  });

  it('판매 옵션이 하나도 없으면 초안은 초안으로 남는다', () => {
    expect(resolveSalesProductStatus({
      current: 'draft',
      options: [{ supplyStatus: 'unused', salePrice: 1000 }],
    })).toBe('draft');
  });

  /**
   * draft 는 "팔 옵션의 판매가가 비었다"는 뜻이다. 팔던 상품의 옵션을 모두 내린 것은
   * 다른 사실이고, 그것까지 초안으로 되돌리면 이미 몰에 올라간 상품이 초안이 된다.
   */
  it('팔던 상품의 판매 옵션이 모두 사라져도 초안으로 되돌리지 않는다', () => {
    expect(resolveSalesProductStatus({
      current: 'active',
      options: [{ supplyStatus: 'unused', salePrice: 1000 }],
    })).toBe('active');
  });

  it('사람이 정한 상태(paused · sold_out · unused · archived)는 값이 차도 그대로 둔다', () => {
    for (const current of ['paused', 'sold_out', 'unused', 'archived'] as const) {
      expect(resolveSalesProductStatus({ current, options: [selling(1000)] })).toBe(current);
      expect(resolveSalesProductStatus({ current, options: [selling(null)] })).toBe(current);
    }
  });
});

describe('requireConfirmedPrice', () => {
  it('값이 다 있는 판매 옵션을 판매가와 함께 돌려준다', () => {
    expect(requireConfirmedPrice({
      name: '테스트 상품',
      status: 'active',
      options: [selling(1000), { id: 'o-unused', supplyStatus: 'unused', salePrice: null }],
    })).toEqual([{ id: 'o-1000', salePrice: 1000 }]);
  });

  it('초안(판매가 미정)은 한 가지 오류로 거절한다', () => {
    const reject = () => requireConfirmedPrice({
      name: '테스트 상품',
      status: 'draft',
      options: [selling(1000), selling(null)],
    });
    expect(reject).toThrow(SalesProductDraftError);
    expect(reject).toThrow('판매가');
  });

  it('status 가 draft 면 옵션 값이 차 있어도 거절한다 — 저장이 상태를 올리기 전이다', () => {
    expect(() => requireConfirmedPrice({ name: '테스트 상품', status: 'draft', options: [selling(1000)] }))
      .toThrow(SalesProductDraftError);
  });

  it('판매 옵션이 하나도 없으면 거절한다', () => {
    expect(() => requireConfirmedPrice({
      name: '테스트 상품',
      status: 'active',
      options: [{ id: 'o', supplyStatus: 'sold_out', salePrice: 1000 }],
    })).toThrow(SalesProductDraftError);
  });

  it('보관한 상품은 거절한다', () => {
    expect(() => requireConfirmedPrice({ name: '테스트 상품', status: 'archived', options: [selling(1000)] }))
      .toThrow(SalesProductDraftError);
  });

  /**
   * 게이트는 **초안인가**를 묻는다. 사장님이 잠시 내려둔 상품(paused)이나 품절 표시를 한
   * 상품(sold_out)은 값이 확정된 상품이고, 몰 엑셀 · 품절 송신이 바로 그런 상품을 다룬다.
   */
  it('사람이 잠시 내려둔 상품과 품절 상품은 값이 차 있으면 통과시킨다', () => {
    for (const status of ['paused', 'sold_out'] as const) {
      expect(requireConfirmedPrice({ name: '테스트 상품', status, options: [selling(1000)] }))
        .toEqual([{ id: 'o-1000', salePrice: 1000 }]);
    }
  });

  it('초안 · 보관은 왜 거절인지 상태별로 말한다', () => {
    expect(() => requireConfirmedPrice({ name: '테스트 상품', status: 'draft', options: [selling(1000)] }))
      .toThrow('판매가');
    expect(() => requireConfirmedPrice({ name: '테스트 상품', status: 'archived', options: [selling(1000)] }))
      .toThrow('보관');
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
