import { describe, expect, it } from 'vitest';
import {
  SourceRecordDuplicateError,
  admitSourceRecord,
  describeRefusal,
} from './source-record-admission';

const existing = (status: 'draft' | 'active' | 'archived' | null) => ({
  sourceRecordId: 'r-1',
  salesProductId: status === null ? null : 'p-1',
  salesProductStatus: status,
});

describe('admitSourceRecord', () => {
  it('같은 원본이 없으면 새 기록을 만든다', () => {
    expect(admitSourceRecord(null)).toEqual({ kind: 'create' });
  });

  it('초안 · 판매 상품 · 보관 상품이 있으면 각각의 이유로 거절하고 링크를 돌려준다', () => {
    expect(admitSourceRecord(existing('draft'))).toEqual({ kind: 'refuse', reason: 'draft_exists', existing: existing('draft') });
    expect(admitSourceRecord(existing('active'))).toEqual({ kind: 'refuse', reason: 'selling_product_exists', existing: existing('active') });
    expect(admitSourceRecord(existing('archived'))).toEqual({ kind: 'refuse', reason: 'archived_product_exists', existing: existing('archived') });
  });

  it('초안 없는 고아 기록도 만들지 않고 거절한다 — 삭제가 원본까지 지워야 재수집이 열린다', () => {
    expect(admitSourceRecord(existing(null))).toEqual({ kind: 'refuse', reason: 'orphan_record', existing: existing(null) });
  });
});

describe('SourceRecordDuplicateError', () => {
  it('거절 이유마다 운영자가 갈 곳을 말하는 문장을 가진다', () => {
    const refusal = admitSourceRecord(existing('draft'));
    if (refusal.kind !== 'refuse') throw new Error('expected refusal');
    const error = new SourceRecordDuplicateError(refusal);
    expect(error.message).toBe(describeRefusal(refusal));
    expect(error.message).toContain('수집 상품');
    expect(error.refusal.existing.salesProductId).toBe('p-1');
  });
});
