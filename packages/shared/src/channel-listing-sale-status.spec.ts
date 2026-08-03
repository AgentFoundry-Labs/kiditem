import { describe, expect, it } from 'vitest';
import {
  isChannelListingOnSale,
  resolveChannelListingSaleStatus,
} from './channel-listing';

describe('channel listing sale status', () => {
  it('uses the newest snapshot status ahead of stale catalog fields', () => {
    expect(resolveChannelListingSaleStatus({
      latestSnapshotStatus: '판매중지',
      rawStatus: '판매중',
      optionStatuses: ['판매중'],
      listingStatus: 'active',
      isActive: true,
    })).toBe('판매중지');
  });

  it('treats only explicit selling states as on sale', () => {
    expect(isChannelListingOnSale('판매중')).toBe(true);
    expect(isChannelListingOnSale('on_sale')).toBe(true);
    expect(isChannelListingOnSale('판매중지')).toBe(false);
    expect(isChannelListingOnSale('미확인')).toBe(false);
  });

  it('does not treat a catalog approval status as a selling state', () => {
    expect(resolveChannelListingSaleStatus({
      listingStatus: '승인완료',
      isActive: true,
    })).toBe('active');
  });
});
