import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { listingAvailabilityExecutionApi } from './listing-availability-execution-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: vi.fn(),
    post: vi.fn(),
  },
}));

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const EXECUTION_ID = '66666666-6666-4666-8666-666666666666';
const LISTING_ID = 'SELLER / ITEM-7';

describe('listingAvailabilityExecutionApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prepares, loads exact account/listing history, starts, and reports through the availability ledger routes', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      executionId: EXECUTION_ID,
      channelAccountId: ACCOUNT_ID,
      status: 'prepared',
      providerOutcome: 'not_attempted',
      payloadHash: 'frozen-hash',
      payload: {
        subject: 'channel_listing',
        channelListingId: '55555555-5555-4555-8555-555555555555',
        channelAccountId: ACCOUNT_ID,
        mallKey: 'coupang',
        externalListingId: LISTING_ID,
        kind: 'sold_out',
        optionCodes: ['VENDOR-7'],
      },
      leaseToken: null,
      maySubmit: false,
      externalListingId: LISTING_ID,
      expectedProviderAccountId: null,
      result: null,
    });
    vi.mocked(apiClient.getParsed).mockResolvedValue([]);
    await listingAvailabilityExecutionApi.prepare({
      channelAccountId: ACCOUNT_ID,
      externalListingId: LISTING_ID,
      kind: 'sold_out',
      optionCodes: ['VENDOR-7'],
      idempotencyKey: 'intent-7',
    });
    await listingAvailabilityExecutionApi.list(ACCOUNT_ID, LISTING_ID);
    await listingAvailabilityExecutionApi.start(EXECUTION_ID);
    await listingAvailabilityExecutionApi.report(EXECUTION_ID, {
      leaseToken: '77777777-7777-4777-8777-777777777777',
      payloadHash: 'frozen-hash',
      outcome: 'uncertain',
      evidence: { channelAccountId: ACCOUNT_ID, externalListingId: LISTING_ID },
    });

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/channels/listing-availability-executions', expect.objectContaining({
      channelAccountId: ACCOUNT_ID,
      externalListingId: LISTING_ID,
      kind: 'sold_out',
    }));
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/listing-availability-executions?channelAccountId=${ACCOUNT_ID}&externalListingId=SELLER+%2F+ITEM-7`,
      expect.anything(),
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(2, `/api/channels/listing-availability-executions/${EXECUTION_ID}/start`, {});
    expect(apiClient.post).toHaveBeenNthCalledWith(3, `/api/channels/listing-availability-executions/${EXECUTION_ID}/result`, expect.objectContaining({
      outcome: 'uncertain',
    }));
  });
});
