import { describe, expect, it, vi } from 'vitest';
import { SourcingBrowserLiveCommerceOperationService } from '../sourcing-browser-live-commerce-operation.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = 'attempt-token-1';

function createHarness(input: Record<string, unknown> = {
  url: 'https://live.douyin.com/123',
}) {
  const transaction = { marker: 'active-attempt-transaction' };
  const attempt = {
    organizationId: ORGANIZATION_ID,
    runId: RUN_ID,
    operationKey: 'sourcing.collect_live_commerce_url',
    input,
    requestedByUserId: 'user-a',
    startedAt: new Date('2026-08-14T00:00:00.000Z'),
    leaseExpiresAt: new Date('2026-08-14T00:10:00.000Z'),
    deadlineAt: new Date('2026-08-14T00:15:00.000Z'),
  };
  const verifier = {
    withActiveBrowserAttemptFence: vi.fn(async (_fence, callback) => callback(attempt, transaction)),
  };
  const permit = {
    runId: 'collection-run-1',
    organizationId: ORGANIZATION_ID,
    sourceKey: 'douyin.live_commerce',
    scopeKey: 'default',
    targetKey: `operation:${RUN_ID}`,
    leaseToken: 'lease-token',
    generation: 1,
    leaseExpiresAt: new Date('2026-08-14T00:10:00.000Z'),
  };
  const collections = {
    claimAuthorizedRunInAttempt: vi.fn(async () => ({ kind: 'claimed' as const, permit })),
    commitInAttempt: vi.fn(async () => ({
      kind: 'committed' as const,
      runId: permit.runId,
      acceptedCount: 3,
      duplicateCount: 0,
      staleDiscardedCount: 0,
    })),
  };
  const service = new SourcingBrowserLiveCommerceOperationService(
    verifier as never,
    collections as never,
  );
  return { service, verifier, collections, transaction };
}

describe('SourcingBrowserLiveCommerceOperationService', () => {
  it('fences the exact live URL operation and commits its owner snapshots inside that attempt transaction', async () => {
    const harness = createHarness();
    const batch = {
      source: 'douyin' as const,
      pageUrl: 'https://live.douyin.com/123',
      broadcast: { broadcastId: 'broadcast-1', title: '문구 라이브' },
      products: [
        { productId: 'product-1', title: '슬라임', rank: 1 },
        { productId: 'product-2', title: '스티커', rank: 2 },
      ],
    };

    await expect(harness.service.ingest({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch,
    })).resolves.toEqual({
      businessDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      source: 'douyin',
      broadcastCount: 1,
      productCount: 2,
      duplicate: false,
    });

    expect(harness.verifier.withActiveBrowserAttemptFence).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: 'sourcing.collect_live_commerce_url',
      attemptToken: ATTEMPT_TOKEN,
    }, expect.any(Function));
    expect(harness.collections.claimAuthorizedRunInAttempt).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        sourceKey: 'douyin.live_commerce',
        targetKey: `operation:${RUN_ID}`,
        triggeredByUserId: 'user-a',
      }),
    );
    expect(harness.collections.commitInAttempt).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        output: expect.objectContaining({
          typedRecords: expect.arrayContaining([
            expect.objectContaining({ kind: 'live_commerce_broadcast' }),
            expect.objectContaining({ kind: 'live_commerce_product' }),
          ]),
        }),
      }),
    );
  });

  it('rejects a payload URL that is not the fenced operation input before a canonical row claim', async () => {
    const harness = createHarness();

    await expect(harness.service.ingest({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        source: 'douyin',
        pageUrl: 'https://live.douyin.com/other',
        broadcast: { broadcastId: 'broadcast-1' },
        products: [],
      },
    })).rejects.toThrow('live_commerce_browser_operation_input_mismatch');

    expect(harness.collections.claimAuthorizedRunInAttempt).not.toHaveBeenCalled();
  });
});
