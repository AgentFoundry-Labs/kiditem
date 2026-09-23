import { describe, expect, it } from 'vitest';
import {
  RegistrationMallInputError,
  acceptedMallFields,
  emptyRegistrationMallInput,
  normalizeRegistrationMallInput,
  withAdapterValues,
} from './registration-mall-input';

describe('normalizeRegistrationMallInput', () => {
  it('몰 카테고리 · 몰 칸 · 어댑터 값만 받는다', () => {
    expect(normalizeRegistrationMallInput({
      mallCategory: { key: 'C-100', label: '유아 의류' },
      mallFields: { deliveryTemplate: 'T1', returnAddress: '서울', freeShipping: true },
      adapter: { coupang: { wingCategoryKey: 'W-9' } },
    })).toEqual({
      mallCategory: { key: 'C-100', label: '유아 의류' },
      mallFields: { deliveryTemplate: 'T1', returnAddress: '서울', freeShipping: true },
      adapter: { coupang: { wingCategoryKey: 'W-9' } },
    });
  });

  it('비어 있으면 빈 설정이다', () => {
    expect(normalizeRegistrationMallInput(undefined)).toEqual(emptyRegistrationMallInput());
    expect(emptyRegistrationMallInput()).toEqual({ mallCategory: null, mallFields: {}, adapter: {} });
  });

  it('상품 사실을 복사한 키는 어느 키인지 말하며 거절한다', () => {
    expect(() => normalizeRegistrationMallInput({ name: '티셔츠', salePrice: 1000, mallFields: {} }))
      .toThrow(RegistrationMallInputError);
    try {
      normalizeRegistrationMallInput({ detailHtml: '<p/>', promoText: '행사' });
    } catch (error) {
      expect((error as RegistrationMallInputError).productFactKeys).toEqual(['detailHtml', 'promoText']);
      expect((error as RegistrationMallInputError).message).toContain('판매 상품 · 옵션 · 상세 페이지');
    }
  });

  it('mallFields 안의 상품 사실 키도 거절하되, 몰 값인 공급가 · 홍보문은 받는다', () => {
    expect(() => normalizeRegistrationMallInput({ mallFields: { salePrice: 1, name: 'x', detailHtml: '<p/>' } }))
      .toThrow(/salePrice, name, detailHtml/);
    expect(normalizeRegistrationMallInput({ mallFields: { supplyPrice: 4700, promoText: '행사' } }).mallFields)
      .toEqual({ supplyPrice: 4700, promoText: '행사' });
  });

  it('몰 칸 값은 2만 자까지 받는다', () => {
    expect(normalizeRegistrationMallInput({ mallFields: { detailTop: 'a'.repeat(20_000) } }).mallFields.detailTop).toHaveLength(20_000);
    expect(() => normalizeRegistrationMallInput({ mallFields: { detailTop: 'a'.repeat(20_001) } })).toThrow();
  });

  it('mallFields 밖에 놓인 몰 칸도 거절한다 — 키가 흩어지지 않게', () => {
    expect(() => normalizeRegistrationMallInput({ deliveryTemplate: 'T1' })).toThrow(RegistrationMallInputError);
  });
});

describe('acceptedMallFields', () => {
  it('저장할 수 있는 칸만 남기고, 못 받는 칸은 키와 까닭을 돌려준다', () => {
    expect(acceptedMallFields({ namePrefix: '[키드]', detailTop: 'a'.repeat(25_000), salePrice: 1, promoText: '행사' })).toEqual({
      mallFields: { namePrefix: '[키드]', promoText: '행사' },
      rejected: [
        { key: 'detailTop', reason: 'too_long' },
        { key: 'salePrice', reason: 'product_fact' },
      ],
    });
  });
});

describe('withAdapterValues', () => {
  it('한 채널의 값만 바꾸고 나머지는 그대로 둔다', () => {
    const base = normalizeRegistrationMallInput({ adapter: { coupang: { a: 1 }, kakao: { b: 2 } } });
    expect(withAdapterValues(base, 'coupang', { a: 9 }).adapter).toEqual({ coupang: { a: 9 }, kakao: { b: 2 } });
    expect(withAdapterValues(base, 'coupang', null).adapter).toEqual({ kakao: { b: 2 } });
    expect(base.adapter).toEqual({ coupang: { a: 1 }, kakao: { b: 2 } });
  });
});
