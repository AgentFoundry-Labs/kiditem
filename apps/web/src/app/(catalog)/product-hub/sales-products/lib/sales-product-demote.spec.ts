import { describe, expect, it } from 'vitest';
import { salesProductDemoteState, salesProductStatusText } from './sales-product-demote';

const CANDIDATE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function product(overrides: Partial<Parameters<typeof salesProductDemoteState>[0]> = {}) {
  return {
    sourceCandidateId: CANDIDATE,
    status: 'active' as const,
    channelListings: [] as Parameters<typeof salesProductDemoteState>[0]['channelListings'],
    options: [{ linkedChannelOptionCount: 0 }] as Parameters<typeof salesProductDemoteState>[0]['options'],
    ...overrides,
  };
}

describe('salesProductDemoteState', () => {
  it('offers sending back only sales products made from a collected product', () => {
    expect(salesProductDemoteState(product())).toEqual({ kind: 'ready' });
    expect(salesProductDemoteState(product({ sourceCandidateId: null }))).toEqual({ kind: 'hidden' });
    expect(salesProductDemoteState(product({ status: 'archived' }))).toEqual({ kind: 'demoted' });
  });

  it('blocks while a live mall listing or option is linked', () => {
    const listing = { isActive: true } as Parameters<typeof salesProductDemoteState>[0]['channelListings'][number];
    expect(salesProductDemoteState(product({ channelListings: [listing] })).kind).toBe('blocked');
    expect(salesProductDemoteState(product({ channelListings: [{ ...listing, isActive: false }] })).kind).toBe('ready');
    const option = { linkedChannelOptionCount: 2 } as Parameters<typeof salesProductDemoteState>[0]['options'][number];
    expect(salesProductDemoteState(product({ options: [option] })).kind).toBe('blocked');
  });
});

describe('salesProductStatusText', () => {
  it('reads a sent-back sales product as sent back, not as its raw status', () => {
    expect(salesProductStatusText({ status: 'archived', sourceCandidateId: CANDIDATE }))
      .toBe('수집상품으로 되돌림');
  });

  it('calls the raw archived status 내림 — it is neither a deletion nor an archive', () => {
    // 되돌리기 표식으로 쓰는 값이라 '삭제' 는 사실이 아니고(코드 · 단품 · 몰별 값이 남는다),
    // '보관' 도 아니다(보관은 이 상태와 같은 말이 아니다).
    expect(salesProductStatusText({ status: 'archived', sourceCandidateId: null })).toBe('내림');
    expect(salesProductStatusText({ status: 'active', sourceCandidateId: CANDIDATE })).toBe('공급중');
  });
});
