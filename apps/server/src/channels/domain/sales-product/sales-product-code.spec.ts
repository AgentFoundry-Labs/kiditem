import { describe, expect, it } from 'vitest';
import {
  KID_ISSUE_MOMENT,
  issuesKidCodes,
  planKidIssue,
} from './sales-product-code';

describe('KID 발급 시점', () => {
  it('판매하기로 정한 시점에 발급한다 — 초안을 만들 때가 아니다', () => {
    expect(KID_ISSUE_MOMENT).toBe('sale_decided');
    expect(issuesKidCodes('sale_decided')).toBe(true);
    expect(issuesKidCodes('draft_created')).toBe(false);
  });
});

describe('planKidIssue', () => {
  it('상품과 단품 중 비어 있는 것만 발급 대상으로 센다', () => {
    expect(planKidIssue({
      code: null,
      options: [
        { id: 'a', optionCode: null, components: [] },
        { id: 'b', optionCode: 'KID00000007', components: [] },
      ],
    })).toEqual({ product: true, optionIds: ['a'], reuse: {} });
  });

  it('이미 다 발급됐으면 아무것도 하지 않는다(멱등)', () => {
    expect(planKidIssue({
      code: 'KID00000001',
      options: [{ id: 'a', optionCode: 'KID00000002', components: [] }],
    })).toEqual({ product: false, optionIds: [], reuse: {} });
  });

  /** 셀피아 단품 하나로만 이루어진 단품은 그 원천 KID 를 그대로 쓴다 — 번호를 하나 더 태우지 않는다. */
  it('셀피아 단품 하나짜리 구성은 그 원천 코드를 다시 쓴다', () => {
    expect(planKidIssue({
      code: 'KID00000001',
      options: [
        { id: 'a', optionCode: null, components: [{ masterProductId: 'm-1', quantity: 1 }] },
        { id: 'b', optionCode: null, components: [{ masterProductId: 'm-1', quantity: 2 }] },
        { id: 'c', optionCode: null, components: [{ masterProductId: 'm-1', quantity: 1 }, { masterProductId: 'm-2', quantity: 1 }] },
      ],
      masterProductCodes: new Map([['m-1', 'KID00000888']]),
    })).toEqual({ product: false, optionIds: ['b', 'c'], reuse: { a: 'KID00000888' } });
  });

  it('원천 코드를 모르면 새로 발급한다', () => {
    expect(planKidIssue({
      code: null,
      options: [{ id: 'a', optionCode: null, components: [{ masterProductId: 'm-9', quantity: 1 }] }],
    })).toEqual({ product: true, optionIds: ['a'], reuse: {} });
  });
});
