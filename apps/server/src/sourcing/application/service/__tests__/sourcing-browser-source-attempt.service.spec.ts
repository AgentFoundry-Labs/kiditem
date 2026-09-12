import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourcingBrowserSourceAttemptService } from '../sourcing-browser-source-attempt.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000011';

function createHarness() {
  const attempts = {
    readAttempt: vi.fn(async () => ({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      sourceKey: '1688.hot_product',
      scopeKey: 'default',
      targetKey: 'all',
      generation: 1,
      state: 'RUNNING' as const,
      expiresAt: new Date('2026-09-04T01:30:00.000Z'),
      planChecksum: 'plan-checksum',
      contentChecksum: null,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
      plan: { source: '1688.hot_product', keywords: ['铅笔', '笔袋'] },
    })),
    readSourceStatus: vi.fn(async () => ({
      ready: true,
      refreshing: false,
      latestAttempt: null,
      latestComplete: null,
      actualCutoffAt: null,
      errorCode: null,
      errorMessage: null,
    })),
    beginAttempt: vi.fn(async (input) => ({
      created: true,
      attempt: {
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        state: 'RUNNING' as const,
        expiresAt: new Date('2026-09-04T01:30:00.000Z'),
        plan: input.plan,
      },
    })),
    completeAttempt: vi.fn(async () => ({ state: 'COMPLETE' as const })),
    failAttempt: vi.fn(async () => ({ state: 'FAILED' as const })),
  };
  const trends = {
    list1688Targets: vi.fn(async () => [
      { label: '연필', keyword: '铅笔' },
      { label: '필통', keyword: '笔袋' },
    ]),
  };
  const service = new SourcingBrowserSourceAttemptService(
    attempts as never,
    trends as never,
  );
  return { service, attempts, trends };
}

describe('SourcingBrowserSourceAttemptService', () => {
  it('freezes the current 1688 target plan in the owner-issued attempt', async () => {
    const { service, attempts, trends } = createHarness();

    await expect(service.begin1688({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: '1688-refresh-1',
    })).resolves.toMatchObject({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      state: 'RUNNING',
      plan: { source: '1688.hot_product', keywords: ['铅笔', '笔袋'] },
    });

    expect(trends.list1688Targets).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(attempts.beginAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      sourceKey: '1688.hot_product',
      scopeKey: 'default',
      targetKey: 'all',
      idempotencyKey: '1688-refresh-1',
      requestFingerprint: expect.any(String),
      expiresInMs: 15 * 60_000,
      plan: {
        source: '1688.hot_product',
        keywords: ['铅笔', '笔袋'],
      },
    }));
  });

  it('rejects a 1688 fail whose valid token belongs to another source', async () => {
    const { service, attempts } = createHarness();
    attempts.readAttempt.mockResolvedValueOnce({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      sourceKey: 'tiktok.creative',
      scopeKey: 'default',
      targetKey: 'all',
      generation: 1,
      state: 'RUNNING' as const,
      expiresAt: new Date('2026-09-04T01:30:00.000Z'),
      planChecksum: 'plan-checksum',
      contentChecksum: null,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
      plan: { source: 'tiktok.creative' },
    });

    await expect(service.fail1688({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      code: 'SOURCE_COLLECTION_FAILED',
      message: 'The other source token is valid but must not cross the owner fence.',
    })).rejects.toThrow('SOURCE_ATTEMPT_NOT_FOUND');

    expect(attempts.readAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
    });
    expect(attempts.failAttempt).not.toHaveBeenCalled();
  });

  it('does not publish a partial 1688 payload when one frozen keyword failed', async () => {
    const { service, attempts } = createHarness();

    await expect(service.complete1688({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        keywords: [{ keyword: '铅笔', items: [] }, { keyword: '笔袋', items: [] }],
        errors: [{ target: '笔袋', message: 'provider timeout' }],
      },
    })).resolves.toMatchObject({ state: 'FAILED' });

    expect(attempts.completeAttempt).not.toHaveBeenCalled();
    expect(attempts.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      code: 'SOURCE_PLAN_INCOMPLETE',
    }));
  });

  it('reads freshness against the current target checksum while keeping a running refresh separate', async () => {
    const { service, attempts } = createHarness();

    await expect(service.read1688Status({ organizationId: ORGANIZATION_ID }))
      .resolves.toMatchObject({ ready: true, refreshing: false });

    expect(attempts.readSourceStatus).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceKey: '1688.hot_product',
      scopeKey: 'default',
      targetKey: 'all',
      currentPlanChecksum: expect.any(String),
    });
  });

  it('terminalizes a payload whose keyword set differs from the frozen plan before canonical storage', async () => {
    const { service, attempts } = createHarness();

    await expect(service.complete1688({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        keywords: [{ keyword: '다른 키워드', items: [] }],
      },
    })).resolves.toMatchObject({ state: 'FAILED' });

    expect(attempts.completeAttempt).not.toHaveBeenCalled();
    expect(attempts.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SOURCE_PLAN_MISMATCH',
    }));
  });

  it('terminalizes malformed one-shot evidence instead of leaving the owner attempt RUNNING', async () => {
    const { service, attempts } = createHarness();

    await expect(service.complete1688({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: { keywords: [{ keyword: '铅笔', items: null as never }] },
    })).resolves.toMatchObject({ state: 'FAILED' });

    expect(attempts.completeAttempt).not.toHaveBeenCalled();
    expect(attempts.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SOURCE_BATCH_INVALID',
    }));
  });

  it('uses the same terminal checksum when an extension replays an identical payload later', async () => {
    const { service, attempts } = createHarness();
    const batch = {
      keywords: [{ keyword: '铅笔', items: [{ offerId: 'offer-1', rank: 1 }] }, { keyword: '笔袋', items: [] }],
    };
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
      await service.complete1688({
        organizationId: ORGANIZATION_ID,
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        batch,
      });
      vi.setSystemTime(new Date('2026-09-04T00:10:00.000Z'));
      await service.complete1688({
        organizationId: ORGANIZATION_ID,
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        batch,
      });
    } finally {
      vi.useRealTimers();
    }

    const checksums = attempts.completeAttempt.mock.calls.map(([input]) => input.contentChecksum);
    expect(checksums).toEqual([checksums[0], checksums[0]]);
  });
});
