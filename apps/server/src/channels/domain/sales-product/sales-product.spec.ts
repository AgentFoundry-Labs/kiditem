import { describe, expect, it } from 'vitest';
import {
  optionSupplyStatusFromSabangnet,
  planSalesProductOptionReplacement,
  SalesProductOptionPlanError,
  salesProductStatusFromSabangnet,
  taxTypeFromSabangnet,
  type SalesProductOptionDraft,
} from './sales-product';

const option = (values: string[], extra: Partial<SalesProductOptionDraft> = {}): SalesProductOptionDraft => ({
  values,
  salePrice: 3000,
  normalPrice: null,
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

  it('keeps issued codes and leaves new identity issuance to the application', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: '100300',
      existing,
      options: [option(['파랑']), option(['초록'], { salePrice: 3500 })],
    });
    expect(plan.writes).toEqual([
      expect.objectContaining({ id: 'a', optionCode: '100300-0001', optionKey: '파랑', sortOrder: 0 }),
      expect.objectContaining({ id: null, optionCode: null, optionKey: '초록', salePrice: 3500, sortOrder: 1 }),
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

  it('creates a new identity for a used composition change while preserving the previous option', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: 'KID00000001',
      existing: [{ id: 'a', optionCode: 'KID00000002', optionKey: '파랑', linkedChannelOptionCount: 1,
        components: [{ masterProductId: 'source', quantity: 1 }] }],
      options: [option(['파랑'], { id: 'a', components: [{ masterProductId: 'source', quantity: 2 }] })],
    });
    expect(plan.writes[0]).toMatchObject({ id: null, replacesOptionId: 'a' });
    expect(plan.retireIds).toEqual(['a']);
    expect(plan.deleteIds).toEqual([]);
  });

  it('keeps an issued identity when an unmapped option is linked for the first time', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: 'KID00000001',
      existing: [{ id: 'a', optionCode: 'KID00000002', optionKey: '파랑', linkedChannelOptionCount: 1, components: [] }],
      options: [option(['파랑'], { id: 'a', components: [{ masterProductId: 'source', quantity: 1 }] })],
    });
    expect(plan.writes[0]).toMatchObject({ id: 'a', optionCode: 'KID00000002' });
    expect(plan.retireIds).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it('creates a new identity for a frozen execution composition change without a listing link', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: 'KID00000001',
      existing: [{
        id: 'a', optionCode: 'KID00000002', optionKey: '파랑', linkedChannelOptionCount: 0,
        executionCount: 1, components: [{ masterProductId: 'source', quantity: 1 }],
      }],
      options: [option(['파랑'], {
        id: 'a', components: [{ masterProductId: 'source', quantity: 2 }],
      })],
    });
    expect(plan.writes[0]).toMatchObject({ id: null, replacesOptionId: 'a', optionCode: null });
    expect(plan.retireIds).toEqual(['a']);
    expect(plan.deleteIds).toEqual([]);
  });

  it('keeps a selected option identity when only its composition changes', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: 'KID00000001',
      existing: [{
        id: 'a', optionCode: 'KID00000002', optionKey: '파랑', linkedChannelOptionCount: 0,
        registrationSelectionCount: 1, components: [{ masterProductId: 'source', quantity: 1 }],
      }],
      options: [option(['파랑'], {
        id: 'a', components: [{ masterProductId: 'source', quantity: 2 }],
      })],
    });
    expect(plan.writes[0]).toMatchObject({ id: 'a', optionCode: 'KID00000002' });
    expect(plan.retireIds).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it('archives a removed option that a registration target still selects', () => {
    const plan = planSalesProductOptionReplacement({
      productCode: 'KID00000001',
      existing: [{
        id: 'a', optionCode: 'KID00000002', optionKey: '파랑', linkedChannelOptionCount: 0,
        registrationSelectionCount: 1,
      }],
      options: [],
    });
    expect(plan.retireIds).toEqual(['a']);
    expect(plan.deleteIds).toEqual([]);
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
  /**
   * 사방넷에서 온 상품은 품번코드를 코드로 가지므로 초안이 아니다(KID-313). 공급중 · 일시중지 ·
   * 완전품절은 판매 상품(active)이고 품절 · 일시중지는 단품 공급상태와 몰 쪽 상태가 말한다.
   * 미사용 · 삭제는 판매를 접은 보관(archived)이다.
   */
  it('maps product status, option supply status and tax codes', () => {
    expect(['1', '2', '3', '4', '5', '6', '7'].map(salesProductStatusFromSabangnet))
      .toEqual(['active', 'active', 'active', 'active', 'archived', 'archived', 'active']);
    expect(['1', '2', '3', null].map(optionSupplyStatusFromSabangnet))
      .toEqual(['selling', 'sold_out', 'unused', 'selling']);
    expect(['1', '2', '3', '4', '5'].map(taxTypeFromSabangnet))
      .toEqual(['taxable', 'tax_free', 'unknown', 'tax_free', 'zero_rated']);
  });
});
