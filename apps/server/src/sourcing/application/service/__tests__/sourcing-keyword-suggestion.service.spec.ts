import { describe, expect, it, vi } from 'vitest';
import { SourcingKeywordSuggestionService } from '../sourcing-keyword-suggestion.service';
import type { CompleteSourcingBrowserSourceAttemptInput } from '../../port/out/repository/sourcing-browser-source-attempt.repository.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000010';
const attemptToken = '00000000-0000-4000-8000-000000000011';
const plan = { source: 'coupang.keyword_suggestion', keyword: 'A Pencil', maxResults: 30 };
const batch = {
  keyword: 'A Pencil', capturedAt: '2026-08-14T00:00:30.000Z',
  items: [{ rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' as const }],
  productNameTokens: [{ keyword: '연필', count: 4 }],
};

function harness() {
  const attempt = { attemptId, attemptToken, sourceKey: plan.source, scopeKey: 'default',
    targetKey: 'keyword:a pencil', generation: 1, state: 'RUNNING', plan,
    planChecksum: 'plan-checksum', expiresAt: new Date('2026-09-06T00:15:00Z'),
    contentChecksum: null, errorCode: null, errorMessage: null, completedAt: null };
  const attempts = {
    beginAttempt: vi.fn(async () => ({ attempt, created: true })),
    readAttempt: vi.fn(async () => attempt),
    completeAttempt: vi.fn(async (_input: CompleteSourcingBrowserSourceAttemptInput) => ({ ...attempt, state: 'COMPLETE' })),
    failAttempt: vi.fn(async (input: { code: string }) => ({ ...attempt, state: 'FAILED', errorCode: input.code })),
    readSourceStatus: vi.fn(async () => ({ status: 'MISSING' })),
  };
  const snapshots = { findLatest: vi.fn(async () => ({ capturedAt: new Date(batch.capturedAt),
    items: batch.items, productNameTokens: batch.productNameTokens })) };
  return { attempt, attempts, snapshots,
    service: new SourcingKeywordSuggestionService(attempts as never, snapshots) };
}

describe('Coupang keyword suggestion source owner', () => {
  it('freezes the strict normalized public input with a fixed 15-minute expiry', async () => {
    const { service, attempts } = harness();
    const result = await service.begin({ organizationId, requestedByUserId: null,
      idempotencyKey: 'request-1', input: { keyword: '  Ａ   Pencil ', maxResults: 30 } });
    expect(result).toMatchObject({ attemptId, plan });
    expect(result).not.toHaveProperty('created');
    expect(attempts.beginAttempt).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: plan.source, scopeKey: 'default', targetKey: 'keyword:a pencil',
      plan, expiresInMs: 900_000, collectorVersion: 'coupang-keyword-suggestion/v1',
    }));
    for (const input of [{ keyword: 'pencil' }, { keyword: 'pencil', maxResults: 31 },
      { keyword: 'pencil', maxResults: 1, arbitrary: true }]) {
      await expect(service.begin({ organizationId, requestedByUserId: null,
        idempotencyKey: 'invalid', input })).rejects.toThrow();
    }
  });

  it('preserves normalized evidence, ranks, token counts, warnings, and replay checksum', async () => {
    const { service, attempts } = harness();
    await service.complete({ organizationId, attemptId, attemptToken, batch: { ...batch, warnings: ['fallback'] } });
    const first = attempts.completeAttempt.mock.calls[0]?.[0];
    expect(first).toMatchObject({ output: { observations: [{ rawPayload: batch }],
      qualityReport: { warnings: ['fallback'] } }, sourceWindowEndAt: new Date(batch.capturedAt) });
    await service.complete({ organizationId, attemptId, attemptToken,
      batch: { ...batch, keyword: ' ａ  pencil ', warnings: ['fallback'] } });
    expect(attempts.completeAttempt.mock.calls[1]?.[0].contentChecksum).toBe(first?.contentChecksum);
    await expect(service.snapshot({ organizationId, keyword: ' Ａ Pencil ' })).resolves.toEqual({
      keyword: 'A Pencil', generatedAt: batch.capturedAt, sourceKey: plan.source,
      schemaVersion: 'coupang-keyword-suggestion/v1', items: batch.items,
      productNameTokens: batch.productNameTokens,
    });
  });

  it('fails invalid coverage and fences wrong source, scope, and token before publication', async () => {
    const { service, attempt, attempts } = harness();
    await expect(service.complete({ organizationId, attemptId, attemptToken,
      batch: { ...batch, keyword: 'different' } })).resolves.toMatchObject({
      state: 'FAILED', errorCode: 'SOURCE_PLAN_INCOMPLETE',
    });
    await expect(service.complete({ organizationId, attemptId, attemptToken: 'wrong', batch }))
      .rejects.toThrow('ATTEMPT_FENCE_LOST');
    attempt.sourceKey = '1688.hot_product';
    await expect(service.read({ organizationId, attemptId })).rejects.toThrow('SOURCE_ATTEMPT_NOT_FOUND');
    attempt.sourceKey = plan.source;
    attempt.scopeKey = 'wrong';
    await expect(service.fail({ organizationId, attemptId, attemptToken, code: 'FAILED', message: 'failure' }))
      .rejects.toThrow('SOURCE_ATTEMPT_NOT_FOUND');
    expect(attempts.completeAttempt).not.toHaveBeenCalled();
  });
});
