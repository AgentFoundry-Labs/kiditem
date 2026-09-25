import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourcingTiktokSourceAttemptService } from '../sourcing-tiktok-source-attempt.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000011';

function expectedPlan(overrides: Record<string, unknown> = {}) {
  return {
    source: 'tiktok.creative',
    maxItems: 100,
    regionOverride: null,
    targetSeeds: [
      { label: 'Pencil Case', keyword: 'pencil case' },
      { label: 'slime', keyword: 'slime' },
    ],
    ...overrides,
  };
}

function createHarness() {
  const operationRun = vi.fn(() => {
    throw new Error('TikTok source owner must not use OperationRun');
  });
  const claim = vi.fn(() => {
    throw new Error('TikTok source owner must not claim a generic runner');
  });
  const heartbeat = vi.fn(() => {
    throw new Error('TikTok source owner must not write heartbeats');
  });
  const attempts = {
    operationRun,
    claim,
    heartbeat,
    readAttempt: vi.fn(async () => ({
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
      plan: expectedPlan(),
    })),
    readSourceStatus: vi.fn(),
    beginAttempt: vi.fn(async (input) => ({
      created: true,
      attempt: {
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        sourceKey: input.sourceKey,
        scopeKey: input.scopeKey,
        targetKey: input.targetKey,
        generation: 1,
        state: 'RUNNING' as const,
        expiresAt: new Date('2026-09-04T01:30:00.000Z'),
        planChecksum: input.planChecksum,
        contentChecksum: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        plan: input.plan,
      },
    })),
    completeAttempt: vi.fn(async () => ({ state: 'COMPLETE' as const })),
    failAttempt: vi.fn(async () => ({ state: 'FAILED' as const })),
  };
  const trends = {
    listTiktokCcTargets: vi.fn(async () => [
      { label: '  Pencil Case  ', keyword: '  pencil case ' },
      { label: '  ', keyword: ' slime ' },
      { label: 'ignored', keyword: '   ' },
    ]),
  };
  const service = new SourcingTiktokSourceAttemptService(attempts as never, trends as never);
  return { attempts, operationRun, claim, heartbeat, service, trends };
}

describe('SourcingTiktokSourceAttemptService', () => {
  it('freezes the old TikTok target seed normalization and optional start inputs in one owner attempt', async () => {
    const { service, attempts, trends, operationRun, claim, heartbeat } = createHarness();

    await expect(service.beginTiktok({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'tiktok-refresh-1',
      maxItems: 999,
      region: '!',
    })).resolves.toMatchObject({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      state: 'RUNNING',
      plan: expectedPlan(),
    });

    expect(trends.listTiktokCcTargets).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(attempts.beginAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      sourceKey: 'tiktok.creative',
      scopeKey: 'default',
      targetKey: 'all',
      idempotencyKey: 'tiktok-refresh-1',
      requestFingerprint: expect.any(String),
      expiresInMs: 15 * 60_000,
      plan: expectedPlan(),
      planChecksum: expect.any(String),
    }));
    expect(operationRun).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('keeps the first frozen plan on an idempotent replay even after source targets change', async () => {
    const { service, attempts, trends, operationRun, claim, heartbeat } = createHarness();
    let persisted: Awaited<ReturnType<typeof attempts.beginAttempt>>['attempt'] | null = null;
    attempts.beginAttempt.mockImplementation(async (input) => {
      if (persisted) return { attempt: persisted, created: false };
      persisted = {
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        sourceKey: input.sourceKey,
        scopeKey: input.scopeKey,
        targetKey: input.targetKey,
        generation: 1,
        state: 'RUNNING' as const,
        expiresAt: new Date('2026-09-04T01:30:00.000Z'),
        planChecksum: input.planChecksum,
        contentChecksum: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        plan: input.plan,
      };
      return { attempt: persisted, created: true };
    });
    trends.listTiktokCcTargets
      .mockResolvedValueOnce([{ label: 'first', keyword: 'first' }])
      .mockResolvedValueOnce([{ label: 'changed', keyword: 'changed' }]);

    const first = await service.beginTiktok({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'tiktok-response-loss-key',
    });
    const replay = await service.beginTiktok({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'tiktok-response-loss-key',
    });

    expect(replay).toEqual(first);
    expect(replay.plan).toEqual(first.plan);
    expect(attempts.beginAttempt).toHaveBeenCalledTimes(2);
    expect(operationRun).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('uses normalized start options in the idempotency fingerprint without including mutable target seeds', async () => {
    const { service, attempts, trends } = createHarness();
    let firstFingerprint: string | null = null;
    attempts.beginAttempt.mockImplementation(async (input) => {
      if (firstFingerprint && firstFingerprint !== input.requestFingerprint) {
        throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
      }
      firstFingerprint ??= input.requestFingerprint;
      return {
        created: true,
        attempt: {
          attemptId: ATTEMPT_ID,
          attemptToken: ATTEMPT_TOKEN,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          generation: 1,
          state: 'RUNNING' as const,
          expiresAt: new Date('2026-09-04T01:30:00.000Z'),
          planChecksum: input.planChecksum,
          contentChecksum: null,
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          plan: input.plan,
        },
      };
    });
    trends.listTiktokCcTargets
      .mockResolvedValueOnce([{ label: 'first', keyword: 'first' }])
      .mockResolvedValueOnce([{ label: 'changed', keyword: 'changed' }])
      .mockResolvedValueOnce([{ label: 'changed again', keyword: 'changed-again' }]);

    await service.beginTiktok({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'tiktok-options-key',
      maxItems: 12,
      region: 'kr',
    });
    await expect(service.beginTiktok({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'tiktok-options-key',
      maxItems: 12,
      region: 'kr',
    })).resolves.toMatchObject({ attemptId: ATTEMPT_ID });
    await expect(service.beginTiktok({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'tiktok-options-key',
      maxItems: 13,
      region: 'kr',
    })).rejects.toThrow('SOURCE_IDEMPOTENCY_KEY_REUSED');
  });

  it('terminalizes partial TikTok evidence as FAILED without moving the complete pointer', async () => {
    const { service, attempts, operationRun, claim, heartbeat } = createHarness();

    await expect(service.completeTiktok({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        region: 'KR',
        items: [],
        visitedTargetIds: ['hashtag'],
        errors: [{ target: 'product', message: 'provider failed' }],
      },
    })).resolves.toMatchObject({ state: 'FAILED' });

    expect(attempts.completeAttempt).not.toHaveBeenCalled();
    expect(attempts.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      code: 'SOURCE_PLAN_INCOMPLETE',
    }));
    expect(operationRun).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('submits only frozen, complete TikTok evidence to the source owner transaction', async () => {
    const { service, attempts } = createHarness();

    await expect(service.completeTiktok({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        region: 'KR',
        items: [{ trendType: 'hashtag', entityKey: 'school-supplies', rank: 1 }],
        visitedTargetIds: ['hashtag', 'product', 'keyword:pencil case', 'keyword:slime'],
      },
    })).resolves.toMatchObject({ state: 'COMPLETE' });

    expect(attempts.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      planChecksum: 'plan-checksum',
      output: expect.objectContaining({
        rejectedCount: 0,
        typedRecords: expect.arrayContaining([
          expect.objectContaining({
            kind: 'tiktok_creative',
            row: expect.objectContaining({
              operationId: ATTEMPT_ID,
              region: 'KR',
              trendType: 'hashtag',
              entityKey: 'school-supplies',
            }),
          }),
        ]),
      }),
    }));
  });

  it('accepts only an exact full plan or maxItems prefix as complete evidence', async () => {
    const { service, attempts } = createHarness();
    const items = Array.from({ length: 100 }, (_, index) => ({
      trendType: 'hashtag',
      entityKey: `early-stop-${index}`,
      rank: index + 1,
    }));

    await expect(service.completeTiktok({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        region: 'US',
        items,
        visitedTargetIds: ['hashtag'],
      },
    })).resolves.toMatchObject({ state: 'COMPLETE' });

    expect(attempts.completeAttempt).toHaveBeenCalled();

    const invalid = createHarness();
    await expect(invalid.service.completeTiktok({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        region: 'US',
        items: [],
        visitedTargetIds: ['hashtag', 'keyword:slime'],
      },
    })).resolves.toMatchObject({ state: 'FAILED' });
    expect(invalid.attempts.completeAttempt).not.toHaveBeenCalled();
    expect(invalid.attempts.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SOURCE_PLAN_INCOMPLETE',
    }));
  });

  it('fails a fully visited payload that exceeds the frozen maxItems limit', async () => {
    const { service, attempts } = createHarness();
    attempts.readAttempt.mockResolvedValue({
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
      plan: expectedPlan({ maxItems: 1 }),
    });

    await expect(service.completeTiktok({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        region: 'US',
        items: [
          { trendType: 'hashtag', entityKey: 'one' },
          { trendType: 'product', entityKey: 'two' },
        ],
        visitedTargetIds: ['hashtag', 'product', 'keyword:pencil case', 'keyword:slime'],
      },
    })).resolves.toMatchObject({ state: 'FAILED' });

    expect(attempts.completeAttempt).not.toHaveBeenCalled();
    expect(attempts.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SOURCE_PLAN_INCOMPLETE',
    }));
  });
});
