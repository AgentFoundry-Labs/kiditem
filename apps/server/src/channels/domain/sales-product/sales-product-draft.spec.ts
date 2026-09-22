import { describe, expect, it } from 'vitest';
import {
  SalesProductDraftError,
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

  it('판매 옵션이 하나도 없으면 draft 다 — 팔 수 있는 것이 없다', () => {
    expect(resolveSalesProductStatus({
      current: 'draft',
      options: [{ id: 'x', supplyStatus: 'unused', salePrice: 1000 }],
    })).toBe('draft');
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
