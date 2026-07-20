import { describe, expect, it } from 'vitest';
import {
  canRetryChannelListingDeletionProviderSideEffect,
  ChannelListingDeletionOperationSchema,
  ChannelListingRegistrationResultSchema,
  MarketplaceSubmissionResultSchema,
} from './channel-listing';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const LISTING_ID = '22222222-2222-4222-8222-222222222222';

describe('channel listing registration contracts', () => {
  it('parses a listing-fenced deletion operation with a frozen external identity', () => {
    expect(ChannelListingDeletionOperationSchema.parse({
      id: '33333333-3333-4333-8333-333333333333',
      organizationId: '44444444-4444-4444-8444-444444444444',
      channelAccountId: ACCOUNT_ID,
      channelListingId: LISTING_ID,
      idempotencyKey: 'delete:427011919:v1',
      requestHash: 'sha256:delete-request',
      externalListingId: '427011919',
      status: 'prepared',
      providerOutcome: 'not_attempted',
      resultJson: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      leaseToken: null,
      leaseClaimedAt: null,
      requestedByUserId: null,
      authorizationExpiresAt: null,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    })).toMatchObject({
      channelListingId: LISTING_ID,
      externalListingId: '427011919',
      providerOutcome: 'not_attempted',
    });
  });

  it('never retries an uncertain provider delete side effect', () => {
    expect(canRetryChannelListingDeletionProviderSideEffect('prepared', 'not_attempted')).toBe(true);
    expect(canRetryChannelListingDeletionProviderSideEffect('prepared', 'uncertain')).toBe(false);
    expect(canRetryChannelListingDeletionProviderSideEffect('executing', 'succeeded')).toBe(false);
    expect(canRetryChannelListingDeletionProviderSideEffect('reconciling', 'definitive_failure')).toBe(false);
  });

  it.each(['succeeded', 'failed', 'cancelled'] as const)(
    'does not retry terminal delete operations (%s)',
    (status) => {
      expect(canRetryChannelListingDeletionProviderSideEffect(status, 'not_attempted')).toBe(false);
    },
  );

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
