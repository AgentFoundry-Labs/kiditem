import { describe, expect, it, vi } from 'vitest';
import { ChannelListingDeletionService } from '../channel-listing-deletion.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LISTING = '22222222-2222-4222-8222-222222222222';
const OPERATION = '33333333-3333-4333-8333-333333333333';

function build() {
  const markDeletionUnresolved = vi.fn().mockResolvedValue({
    operationId: OPERATION,
    status: 'reconciling',
    providerOutcome: 'uncertain',
  });
  const getDeletionOperation = vi.fn().mockResolvedValue({
    operationId: OPERATION,
    listingId: LISTING,
    channelAccountId: '44444444-4444-4444-8444-444444444444',
    expectedVendorId: 'A00012345',
    externalId: '16311428128',
    status: 'reconciling',
    providerOutcome: 'uncertain',
    completedAt: null,
    lastErrorCode: null,
  });
  const service = new ChannelListingDeletionService({
    markDeletionUnresolved,
    getDeletionOperation,
  } as never);
  return { service, markDeletionUnresolved, getDeletionOperation };
}

describe('ChannelListingDeletionService durable operation', () => {
  it('rejects new deletion authorization and claim before any repository mutation', async () => {
    const harness = build();

    expect(() => harness.service.authorize({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      password: 'unused',
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    })).toThrow('not supported without an independent provider verifier');

    expect(() => harness.service.claimExecution({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      operationId: OPERATION,
    })).toThrow('not supported without an independent provider verifier');

    expect(harness.getDeletionOperation).not.toHaveBeenCalled();
    expect(harness.markDeletionUnresolved).not.toHaveBeenCalled();
  });

  it('records unknown browser outcomes as unresolved without deactivating the listing', async () => {
    const harness = build();

    await expect(harness.service.markUnresolved({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      operationId: OPERATION,
      reason: 'extension_timeout',
    })).resolves.toEqual({
      operationId: OPERATION,
      status: 'reconciling',
      providerOutcome: 'uncertain',
    });
    expect(harness.markDeletionUnresolved).toHaveBeenCalled();
  });

  it('preserves a succeeded receipt replay without an external provider call', async () => {
    const harness = build();
    harness.getDeletionOperation.mockResolvedValueOnce({
      operationId: OPERATION,
      status: 'succeeded',
      providerOutcome: 'succeeded',
    });

    await expect(harness.service.reconcileObservedDeletion({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      operationId: OPERATION,
    })).resolves.toEqual({
      operationId: OPERATION,
      status: 'succeeded',
      providerOutcome: 'succeeded',
    });
  });

  it('rejects a pending provider verification instead of guessing deletion', async () => {
    const harness = build();

    await expect(harness.service.reconcileObservedDeletion({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      operationId: OPERATION,
    })).rejects.toThrow('not supported without an independent provider verifier');
  });
});
