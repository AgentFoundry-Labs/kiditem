import { describe, expect, it } from 'vitest';
import { mallDefaultPriceRateBp, mallDisplayName, mallNamePriceCode, salesProductMallPrice } from './sales-product';

describe('mallDisplayName', () => {
  it('drops a leading consumer price of three or more digits', () => {
    expect(mallDisplayName('3500 게틀링 비눗방울총(1p)')).toBe('게틀링 비눗방울총(1p)');
    expect(mallDisplayName('700받아쓰기노트(10권)')).toBe('받아쓰기노트(10권)');
    expect(mallDisplayName('4500포도 말랑이')).toBe('포도 말랑이');
  });

describe('mallNamePriceCode', () => {
  it('reads a leading consumer price and ignores a spec number', () => {
    expect(mallNamePriceCode('6000초코파이 크런치')).toBe(6000);
    expect(mallNamePriceCode('3500 게틀링 비눗방울총')).toBe(3500);
    expect(mallNamePriceCode('110g 초경량 우산')).toBeNull();
    expect(mallNamePriceCode('비눗방울총')).toBeNull();
  });
});

  it('keeps numbers that are part of the name or carry a unit', () => {
    expect(mallDisplayName('110g 초경량 UV차단 3단 접이식 우산(1p)')).toBe('110g 초경량 UV차단 3단 접이식 우산(1p)');
    expect(mallDisplayName('100p 클립 세트')).toBe('100p 클립 세트');
    expect(mallDisplayName('500개입 고무밴드')).toBe('500개입 고무밴드');
    expect(mallDisplayName('1+1 5000돌고래비눗방울')).toBe('1+1 5000돌고래비눗방울');
    expect(mallDisplayName('2024')).toBe('2024');
  });
});

describe('몰 기본 적용율', () => {
  it('몰별 값이 없으면 그 몰의 적용율로 계산한다(사방넷 적용율과 같은 뜻)', () => {
    expect(salesProductMallPrice({ salePrice: 10_000, extraPrice: 0, defaultRateBp: mallDefaultPriceRateBp('domeggook') })).toBe(9_000);
    expect(salesProductMallPrice({ salePrice: 10_000, extraPrice: 0, defaultRateBp: mallDefaultPriceRateBp('ssg') })).toBe(10_800);
  });

  it('사람이 정한 몰 금액 · 비율이 언제나 이긴다', () => {
    const override = { salePrice: 12_340, priceRateBp: null };
    expect(salesProductMallPrice({ salePrice: 10_000, extraPrice: 0, override, defaultRateBp: 9_000 })).toBe(12_340);
    expect(salesProductMallPrice({
      salePrice: 10_000, extraPrice: 0, override: { salePrice: null, priceRateBp: 11_000 }, defaultRateBp: 9_000,
    })).toBe(11_000);
  });

  it('적용율을 주지 않으면 기준가가 그대로 간다 — 올라간 가격을 말없이 바꾸지 않는다', () => {
    expect(salesProductMallPrice({ salePrice: 10_000, extraPrice: 0 })).toBe(10_000);
    expect(mallDefaultPriceRateBp('onch')).toBeNull();
  });

  it('단품 추가금액은 적용율 뒤에 더한다', () => {
    expect(salesProductMallPrice({ salePrice: 10_000, extraPrice: 500, defaultRateBp: 9_000 })).toBe(9_500);
  });
});
