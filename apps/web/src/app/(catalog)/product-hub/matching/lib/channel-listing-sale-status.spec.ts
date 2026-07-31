import { describe, expect, it } from 'vitest';
import { isChannelListingOnSale } from './channel-listing-sale-status';

describe('isChannelListingOnSale', () => {
  it.each([
    'active',
    'ON_SALE',
    '활성',
    '판매중',
  ])('recognizes %s as an on-sale channel status', (status) => {
    expect(isChannelListingOnSale(status)).toBe(true);
  });

  it.each([
    null,
    'APPROVED',
    '승인완료',
    '승인반려',
    '비활성',
    '단종',
    'observed',
  ])('does not recognize %s as an on-sale channel status', (status) => {
    expect(isChannelListingOnSale(status)).toBe(false);
  });
});
