import { describe, expect, it, vi } from 'vitest';
import { SourcingKeywordSuggestionService } from '../sourcing-keyword-suggestion.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000011';
const EVIDENCE_RUN_ID = '00000000-0000-4000-8000-000000000020';

function createHarness(operationInput: Record<string, unknown> = {
  keyword: '  Ａ   Pencil ',
  maxResults: 30,
}) {
  const transaction = { opaque: true };
  const attempt = {
    runId: RUN_ID,
    organizationId: ORGANIZATION_ID,
    operationKey: 'sourcing.collect_keyword_suggestions',
    input: operationInput,
    requestedByUserId: USER_ID,
    startedAt: new Date('2026-08-14T00:00:00.000Z'),
    leaseExpiresAt: new Date('2026-08-14T00:05:00.000Z'),
    deadlineAt: new Date('2026-08-14T00:15:00.000Z'),
  };
  const verifier = {
    verifyActiveBrowserAttempt: vi.fn(),
    withActiveBrowserAttemptFence: vi.fn(async (_input, operation) =>
      operation(attempt, transaction)),
  };
  const permit = {
    runId: EVIDENCE_RUN_ID,
    organizationId: ORGANIZATION_ID,
    sourceKey: 'coupang.keyword_suggestion',
    scopeKey: 'default',
    targetKey: 'keyword:a pencil',
    leaseToken: '00000000-0000-4000-8000-000000000021',
    generation: 1,
    leaseExpiresAt: new Date('2026-08-14T00:02:00.000Z'),
  };
  const collectionRepository = {
    claimAuthorizedRunInAttempt: vi.fn(async () => ({
      kind: 'claimed' as const,
      permit,
    })),
    commitInAttempt: vi.fn(async () => ({
      kind: 'committed' as const,
      runId: EVIDENCE_RUN_ID,
      acceptedCount: 1,
      duplicateCount: 0,
      staleDiscardedCount: 0,
    })),
  };
  const snapshotRepository = {
    findLatest: vi.fn(async () => null),
  };
  const service = new SourcingKeywordSuggestionService(
    verifier as never,
    collectionRepository as never,
    snapshotRepository as never,
  );
  return {
    collectionRepository,
    permit,
    service,
    snapshotRepository,
    transaction,
    verifier,
  };
}

const batch = {
  keyword: 'A Pencil',
  capturedAt: '2026-08-14T00:00:30.000Z',
  items: [{
    rank: 1,
    keyword: '아동 연필',
    source: 'coupang-autocomplete' as const,
  }],
  productNameTokens: [{ keyword: '연필', count: 4 }],
};

describe('SourcingKeywordSuggestionService', () => {
  it('claims and commits controlled evidence inside the exact active attempt transaction', async () => {
    const harness = createHarness();

    await expect(harness.service.ingestBrowserBatch({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch,
    })).resolves.toEqual({ published: true, acceptedCount: 1, duplicate: false });

    expect(harness.verifier.verifyActiveBrowserAttempt).not.toHaveBeenCalled();
    expect(harness.verifier.withActiveBrowserAttemptFence).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: 'sourcing.collect_keyword_suggestions',
      attemptToken: ATTEMPT_TOKEN,
    }, expect.any(Function));
    expect(harness.collectionRepository.claimAuthorizedRunInAttempt)
      .toHaveBeenCalledWith(harness.transaction, expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceKey: 'coupang.keyword_suggestion',
        scopeKey: 'default',
        targetKey: 'keyword:a pencil',
        idempotencyKey: `keyword-suggestion-operation:${RUN_ID}`,
        collectorKey: 'coupang-keyword-suggestion-operation',
        collectorVersion: 'coupang-keyword-suggestion/v1',
        triggerKind: 'extension',
        triggeredByUserId: USER_ID,
      }));
    expect(harness.collectionRepository.commitInAttempt)
      .toHaveBeenCalledWith(harness.transaction, {
        permit: harness.permit,
        output: expect.objectContaining({
          discoveredCount: 1,
          rejectedCount: 0,
          typedRecords: [],
          observations: [expect.objectContaining({
            organizationId: ORGANIZATION_ID,
            ingestionRunId: EVIDENCE_RUN_ID,
            sourceKey: 'coupang.keyword_suggestion',
            platform: 'coupang',
            evidenceFamily: 'keyword_suggestion',
            schemaVersion: 'coupang-keyword-suggestion/v1',
            conceptKey: 'a pencil',
            rawPayload: batch,
          })],
        }),
      });
  });

  it('rejects a mismatched keyword or oversized result under the operation fence', async () => {
    const mismatched = createHarness({ keyword: '슬라임', maxResults: 1 });
    await expect(mismatched.service.ingestBrowserBatch({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch,
    })).rejects.toThrow('keyword_suggestion_operation_input_mismatch');
    expect(mismatched.collectionRepository.claimAuthorizedRunInAttempt)
      .not.toHaveBeenCalled();
  });

  it('publishes a durable empty snapshot and makes a replay idempotent', async () => {
    const empty = createHarness();
    empty.collectionRepository.commitInAttempt.mockResolvedValueOnce({
      kind: 'committed',
      runId: EVIDENCE_RUN_ID,
      acceptedCount: 0,
      duplicateCount: 0,
      staleDiscardedCount: 0,
    });
    await expect(empty.service.ingestBrowserBatch({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: { ...batch, items: [], productNameTokens: [] },
    })).resolves.toMatchObject({ published: true, acceptedCount: 0 });
    expect(empty.collectionRepository.commitInAttempt.mock.calls[0]?.[1])
      .toMatchObject({ output: { discoveredCount: 0, observations: [{ rawPayload: {
        items: [], productNameTokens: [],
      } }] } });

    const replay = createHarness();
    replay.collectionRepository.claimAuthorizedRunInAttempt.mockResolvedValueOnce({
      kind: 'existing',
      permit: replay.permit,
    });
    await expect(replay.service.ingestBrowserBatch({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch,
    })).resolves.toEqual({ published: true, acceptedCount: 0, duplicate: true });
    expect(replay.collectionRepository.commitInAttempt).not.toHaveBeenCalled();
  });

  it('returns an exact typed tenant snapshot without exposing evidence JSON', async () => {
    const harness = createHarness();
    harness.snapshotRepository.findLatest.mockResolvedValueOnce({
      capturedAt: new Date(batch.capturedAt),
      items: batch.items,
      productNameTokens: batch.productNameTokens,
    });

    await expect(harness.service.snapshot({
      organizationId: ORGANIZATION_ID,
      keyword: '  Ａ Pencil ',
    })).resolves.toEqual({
      keyword: 'A Pencil',
      generatedAt: batch.capturedAt,
      sourceKey: 'coupang.keyword_suggestion',
      schemaVersion: 'coupang-keyword-suggestion/v1',
      items: batch.items,
      productNameTokens: batch.productNameTokens,
    });
    expect(harness.snapshotRepository.findLatest).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      normalizedKeyword: 'a pencil',
    });
  });
});
