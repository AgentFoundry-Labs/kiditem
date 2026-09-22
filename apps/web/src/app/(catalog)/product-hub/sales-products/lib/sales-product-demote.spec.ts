import { describe, expect, it } from 'vitest';
import { salesProductDemoteState } from './sales-product-demote';

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
