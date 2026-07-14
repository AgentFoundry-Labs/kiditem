import { describe, expect, it } from 'vitest';
import {
  ChannelListingRegistrationResultSchema,
  MarketplaceSubmissionResultSchema,
} from './channel-listing';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const LISTING_ID = '22222222-2222-4222-8222-222222222222';

describe('channel listing registration contracts', () => {
  it('parses an account-scoped provider result without a Master identity', () => {
    expect(
      MarketplaceSubmissionResultSchema.parse({
        providerSubmissionId: 'submission-1',
        externalListingId: '427011919',
        channel: 'coupang',
        rawResult: { code: 'SUCCESS' },
      }),
    ).toEqual({
      providerSubmissionId: 'submission-1',
      externalListingId: '427011919',
      channel: 'coupang',
      rawResult: { code: 'SUCCESS' },
    });
  });

  it('parses the durable listing identity with its channel account', () => {
    expect(
      ChannelListingRegistrationResultSchema.parse({
        listingId: LISTING_ID,
        channelAccountId: ACCOUNT_ID,
        channel: 'coupang',
        externalId: '427011919',
        status: 'active',
      }),
    ).toMatchObject({ listingId: LISTING_ID, channelAccountId: ACCOUNT_ID });
  });

  it('rejects accountless and Master-shaped listing results', () => {
    expect(() =>
      ChannelListingRegistrationResultSchema.parse({
        listingId: LISTING_ID,
        channel: 'coupang',
        externalId: '427011919',
      }),
    ).toThrow();
    expect(() =>
      ChannelListingRegistrationResultSchema.parse({
        listingId: LISTING_ID,
        channelAccountId: ACCOUNT_ID,
        channel: 'coupang',
        externalId: '427011919',
        masterId: '33333333-3333-4333-8333-333333333333',
      }),
    ).toThrow();
  });
});
