import { describe, expect, it } from 'vitest';
import {
  optionSupplyStatusFromSabangnet,
  planSalesProductOptionReplacement,
  resolveSalesProductOptionPrice,
  SalesProductOptionPlanError,
  salesProductStatusFromSabangnet,
  taxTypeFromSabangnet,
  type SalesProductOptionDraft,
} from './sales-product';

const option = (values: string[], extra: Partial<SalesProductOptionDraft> = {}): SalesProductOptionDraft => ({
  values,
  extraPrice: 0,
  supplyStatus: 'selling',
  components: [],
  ...extra,
});

describe('planSalesProductOptionReplacement', () => {
  const existing = [
    { id: 'a', optionCode: '100300-0001', optionKey: '파랑', linkedChannelOptionCount: 2 },
    { id: 'b', optionCode: '100300-0002', optionKey: '노랑', linkedChannelOptionCount: 0 },
    { id: 'c', optionCode: '100300-0003', optionKey: '핑크', linkedChannelOptionCount: 1 },
  ];

  it('keeps codes of options it recognises and numbers new ones after the highest code', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: '100300',
      existing,
      options: [option(['파랑']), option(['초록'], { extraPrice: 500 })],
    });
    expect(plan.writes).toEqual([
      expect.objectContaining({ id: 'a', optionCode: '100300-0001', optionKey: '파랑', sortOrder: 0 }),
      expect.objectContaining({ id: null, optionCode: '100300-0004', optionKey: '초록', extraPrice: 500, sortOrder: 1 }),
    ]);
  });

  it('retires a missing option that a mall option still points to and deletes the rest', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: '100300',
      existing,
      options: [option(['파랑'])],
    });
    expect(plan.retireIds).toEqual(['c']);
    expect(plan.deleteIds).toEqual(['b']);
  });

  it('follows a Sabangnet option code across a renamed value', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: '100300',
      existing,
      options: [option(['블루'], { optionCode: '100300-0001' })],
    });
    expect(plan.writes[0]).toEqual(expect.objectContaining({ id: 'a', optionKey: '블루' }));
    expect(plan.retireIds).toEqual(['c']);
  });

  it('refuses an id from another product and the same option twice', () => {
    expect(() => planSalesProductOptionReplacement({
      productCode: '100300',
      existing,
      options: [option(['파랑'], { id: 'z' })],
    })).toThrow(SalesProductOptionPlanError);
    expect(() => planSalesProductOptionReplacement({
      productCode: '100300',
      existing,
      options: [option(['파랑'], { id: 'a' }), option(['노랑'], { id: 'a' })],
    })).toThrow(SalesProductOptionPlanError);
  });

  it('does not reuse another existing option code for a new option', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: '100300',
      existing,
      options: [option(['파랑']), option(['보라'], { optionCode: '100300-0002' })],
    });
    // 코드가 같은 기존 단품(노랑)을 코드로 따라간다 — 값만 바뀐 것으로 본다.
    expect(plan.writes[1]).toEqual(expect.objectContaining({ id: 'b', optionCode: '100300-0002', optionKey: '보라' }));
  });
});

describe('Sabangnet code mapping', () => {
  it('maps product status, option supply status and tax codes', () => {
    expect(['1', '2', '3', '4', '5', '6', '7'].map(salesProductStatusFromSabangnet))
      .toEqual(['draft', 'active', 'paused', 'sold_out', 'unused', 'archived', 'draft']);
    expect(['1', '2', '3', null].map(optionSupplyStatusFromSabangnet))
      .toEqual(['selling', 'sold_out', 'unused', 'selling']);
    expect(['1', '2', '3', '4', '5'].map(taxTypeFromSabangnet))
      .toEqual(['taxable', 'tax_free', 'unknown', 'tax_free', 'zero_rated']);
  });
});

describe('resolveSalesProductOptionPrice', () => {
  it('adds the option extra price to the mall price, fixed price before rate', () => {
    expect(resolveSalesProductOptionPrice({ salePrice: 1000, extraPrice: 200 })).toBe(1200);
    expect(resolveSalesProductOptionPrice({
      salePrice: 1000,
      extraPrice: 200,
      override: { salePrice: null, priceRateBp: 11_000 },
    })).toBe(1300);
    expect(resolveSalesProductOptionPrice({
      salePrice: 1000,
      extraPrice: 200,
      override: { salePrice: 1500, priceRateBp: 11_000 },
    })).toBe(1700);
  });
});
