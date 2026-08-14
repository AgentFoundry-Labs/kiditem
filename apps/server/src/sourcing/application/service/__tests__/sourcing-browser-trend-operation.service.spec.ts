import { describe, expect, it, vi } from 'vitest';
import { SourcingBrowserTrendOperationService } from '../sourcing-browser-trend-operation.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = 'attempt-token-1';

function createHarness(input: Record<string, unknown> = { keywords: ['儿童笔袋'] }) {
  const transaction = { marker: 'active-attempt-transaction' };
  const attempt = {
    organizationId: ORGANIZATION_ID,
    runId: RUN_ID,
    operationKey: 'sourcing.collect_1688_trends',
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
    sourceKey: '1688.hot_product',
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
      acceptedCount: 2,
      duplicateCount: 0,
      staleDiscardedCount: 0,
    })),
  };
  const recommendations = {
    refresh: vi.fn(async () => ({ data: { runId: 'recommendation-run-1' } })),
  };
  const recommendationRuns = {
    publishStagedRunInAttempt: vi.fn(async () => 'published'),
  };
  const service = new SourcingBrowserTrendOperationService(
    verifier as never,
    collections as never,
    recommendations as never,
    recommendationRuns as never,
  );
  return {
    service,
    verifier,
    collections,
    recommendations,
    recommendationRuns,
    transaction,
  };
}

describe('SourcingBrowserTrendOperationService', () => {
  it('fences 1688 owner ingestion, commits canonical rows in the active transaction, then publishes the persisted entry snapshot under the same token', async () => {
    const harness = createHarness();

    await expect(harness.service.ingest1688({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        keywords: [{
          keyword: '儿童笔袋',
          items: [{ offerId: 'offer-1', title: '儿童笔袋', rank: 1 }],
        }],
      },
    })).resolves.toEqual({
      businessDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      collected: 2,
      errorCount: 0,
      duplicate: false,
    });

    expect(harness.verifier.withActiveBrowserAttemptFence).toHaveBeenNthCalledWith(1, {
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: 'sourcing.collect_1688_trends',
      attemptToken: ATTEMPT_TOKEN,
    }, expect.any(Function));
    expect(harness.collections.claimAuthorizedRunInAttempt).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        targetKey: `operation:${RUN_ID}`,
        triggerKind: 'extension',
        triggeredByUserId: 'user-a',
      }),
    );
    expect(harness.collections.commitInAttempt).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        output: expect.objectContaining({
          typedRecords: expect.arrayContaining([
            expect.objectContaining({ kind: 'offer_1688_keyword_observation' }),
          ]),
        }),
      }),
    );
    expect(harness.recommendations.refresh).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      limit: 50,
      idempotencyKey: `browser-1688:${RUN_ID}:recommendation-refresh`,
      deferPublication: true,
    });
    expect(harness.verifier.withActiveBrowserAttemptFence).toHaveBeenNthCalledWith(2, {
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: 'sourcing.collect_1688_trends',
      attemptToken: ATTEMPT_TOKEN,
    }, expect.any(Function));
    expect(harness.recommendationRuns.publishStagedRunInAttempt).toHaveBeenCalledWith(
      harness.transaction,
      { organizationId: ORGANIZATION_ID, runId: 'recommendation-run-1' },
    );
  });

  it('rejects a browser payload that does not exactly match the fenced operation input before claiming rows', async () => {
    const harness = createHarness({ keywords: ['儿童笔袋'] });

    await expect(harness.service.ingest1688({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        keywords: [{ keyword: '다른 키워드', items: [] }],
      },
    })).rejects.toThrow('1688_browser_operation_input_mismatch');

    expect(harness.collections.claimAuthorizedRunInAttempt).not.toHaveBeenCalled();
    expect(harness.recommendations.refresh).not.toHaveBeenCalled();
  });

  it('treats a pre-snapshot 1688 run as a deterministic input failure instead of re-reading changed targets as a fence loss', async () => {
    const collections = {
      claimAuthorizedRunInAttempt: vi.fn(),
      commitInAttempt: vi.fn(),
    };
    const service = new SourcingBrowserTrendOperationService(
      {
        withActiveBrowserAttemptFence: vi.fn(async (_fence, callback) => callback({ input: {} }, {})),
      } as never,
      collections as never,
      { refresh: vi.fn() } as never,
      { publishStagedRunInAttempt: vi.fn() } as never,
    );

    await expect(service.ingest1688({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        keywords: [{ keyword: '儿童笔袋', items: [] }],
      },
    })).rejects.toThrow('1688_browser_operation_snapshot_required');

    expect(collections.claimAuthorizedRunInAttempt).not.toHaveBeenCalled();
    expect(collections.commitInAttempt).not.toHaveBeenCalled();
  });

  it('fences TikTok typed snapshot ingestion with its exact browser operation key', async () => {
    const harness = createHarness({ maxItems: 100, region: 'KR' });

    await expect(harness.service.ingestTiktokCc({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        region: 'kr',
        items: [{ trendType: 'keyword', entityKey: 'slime', rank: 1 }],
      },
    })).resolves.toEqual({
      businessDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      collected: 2,
      errorCount: 0,
      duplicate: false,
    });

    expect(harness.verifier.withActiveBrowserAttemptFence).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: 'sourcing.collect_tiktok_cc_trends',
      attemptToken: ATTEMPT_TOKEN,
    }, expect.any(Function));
    expect(harness.collections.claimAuthorizedRunInAttempt).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({ sourceKey: 'tiktok.creative', targetKey: `operation:${RUN_ID}` }),
    );
  });
});
