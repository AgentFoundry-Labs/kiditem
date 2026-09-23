import { describe, expect, it } from 'vitest';
import { SALES_PRODUCT_STATUSES } from '@kiditem/shared/sales-product';
import {
  SalesProductStatusError,
  assertStatusInvariant,
  canStartRegistration,
  draftDeletion,
  isDraft,
  statusAfterArchive,
  statusAfterKidIssued,
} from './sales-product-status';

describe('판매 상품 상태 집합', () => {
  it('상태는 draft · active · archived 셋뿐이다', () => {
    expect([...SALES_PRODUCT_STATUSES]).toEqual(['draft', 'active', 'archived']);
  });
});

describe('assertStatusInvariant', () => {
  it('코드 없는 draft 와 코드 있는 active · archived 는 통과한다', () => {
    expect(() => assertStatusInvariant({ name: 'a', code: null, status: 'draft' })).not.toThrow();
    expect(() => assertStatusInvariant({ name: 'a', code: 'KID1', status: 'active' })).not.toThrow();
    expect(() => assertStatusInvariant({ name: 'a', code: 'KID1', status: 'archived' })).not.toThrow();
  });

  it('코드 있는 draft 와 코드 없는 active 는 어긋난 상태다', () => {
    expect(() => assertStatusInvariant({ name: 'a', code: 'KID1', status: 'draft' })).toThrow(SalesProductStatusError);
    expect(() => assertStatusInvariant({ name: 'a', code: null, status: 'active' })).toThrow(SalesProductStatusError);
    expect(() => assertStatusInvariant({ name: 'a', code: null, status: 'archived' })).toThrow(SalesProductStatusError);
  });
});

describe('statusAfterKidIssued', () => {
  it('초안에 KID 를 발급하면 active 가 된다', () => {
    expect(statusAfterKidIssued({ name: 'a', status: 'draft' })).toBe('active');
  });

  it('이미 코드가 있는 상품에는 발급하지 않는다', () => {
    expect(() => statusAfterKidIssued({ name: 'a', status: 'active' })).toThrow(SalesProductStatusError);
    expect(() => statusAfterKidIssued({ name: 'a', status: 'archived' })).toThrow(SalesProductStatusError);
  });
});

describe('statusAfterArchive', () => {
  it('판매 상품은 보관할 수 있고, 보관을 되풀이해도 archived 다', () => {
    expect(statusAfterArchive({ name: 'a', status: 'active' })).toBe('archived');
    expect(statusAfterArchive({ name: 'a', status: 'archived' })).toBe('archived');
  });

  it('초안은 보관하지 않고 지운다', () => {
    expect(() => statusAfterArchive({ name: 'a', status: 'draft' })).toThrow(SalesProductStatusError);
  });
});

describe('draftDeletion', () => {
  it('리스팅도 실행도 없는 초안만 지울 수 있다', () => {
    expect(draftDeletion({ status: 'draft', hasCode: false, hasActiveListing: false, hasLiveExecution: false })).toEqual({ allowed: true });
  });

  it('판매 상품 · 리스팅 · 살아 있는 실행은 각각의 이유로 막는다', () => {
    expect(draftDeletion({ status: 'active', hasCode: true, hasActiveListing: false, hasLiveExecution: false }))
      .toEqual({ allowed: false, reason: 'not_draft' });
    expect(draftDeletion({ status: 'draft', hasCode: false, hasActiveListing: true, hasLiveExecution: false }))
      .toEqual({ allowed: false, reason: 'active_listing' });
    expect(draftDeletion({ status: 'draft', hasCode: false, hasActiveListing: false, hasLiveExecution: true }))
      .toEqual({ allowed: false, reason: 'live_execution' });
  });

  it('상태가 draft 여도 KID 가 있으면 판매 상품이라 지우지 않는다 — 상태를 믿지 않고 코드를 본다', () => {
    expect(draftDeletion({ status: 'draft', hasCode: true, hasActiveListing: false, hasLiveExecution: false }))
      .toEqual({ allowed: false, reason: 'not_draft' });
  });
});

describe('isDraft · canStartRegistration', () => {
  it('초안만 draft 이고, 등록 실행은 active 에서만 연다', () => {
    expect(isDraft('draft')).toBe(true);
    expect(isDraft('active')).toBe(false);
    expect(canStartRegistration('active')).toBe(true);
    expect(canStartRegistration('draft')).toBe(false);
    expect(canStartRegistration('archived')).toBe(false);
  });
});
