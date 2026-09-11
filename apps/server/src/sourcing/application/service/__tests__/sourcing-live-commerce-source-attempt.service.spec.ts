import { describe, expect, it, vi } from 'vitest';
import { SourcingLiveCommerceSourceAttemptService } from '../sourcing-live-commerce-source-attempt.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000011';
const PAGE_URL = 'https://live.douyin.com/123';

function createHarness() {
  const attempt = {
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    sourceKey: 'douyin.live_commerce',
    scopeKey: 'page-url',
    targetKey: PAGE_URL,
    generation: 1,
    state: 'RUNNING' as const,
    expiresAt: new Date('2026-09-04T01:30:00.000Z'),
    planChecksum: 'plan-checksum',
    contentChecksum: null,
    errorCode: null,
    errorMessage: null,
    completedAt: null,
    plan: {
      source: 'douyin',
      pageUrl: PAGE_URL,
      maxProducts: 100,
    },
  };
  const attempts = {
    readAttempt: vi.fn(async () => attempt),
    readSourceStatus: vi.fn(),
    beginAttempt: vi.fn(async (input) => ({
      created: true,
      attempt: {
        ...attempt,
        plan: input.plan,
        planChecksum: input.planChecksum,
      },
    })),
    completeAttempt: vi.fn(async () => ({ state: 'COMPLETE' as const })),
    failAttempt: vi.fn(async () => ({ state: 'FAILED' as const })),
  };
  const service = new SourcingLiveCommerceSourceAttemptService(attempts as never);
  return { service, attempts, attempt };
}

describe('SourcingLiveCommerceSourceAttemptService', () => {
  it('freezes the normalized live URL under its source-specific owner before extension collection', async () => {
    const { service, attempts } = createHarness();

    await expect(service.beginBrowser({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'live-refresh-1',
      url: PAGE_URL,
    })).resolves.toMatchObject({
      attemptId: ATTEMPT_ID,
      state: 'RUNNING',
      plan: { source: 'douyin', pageUrl: PAGE_URL, maxProducts: 100 },
    });

    expect(attempts.beginAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      sourceKey: 'douyin.live_commerce',
      scopeKey: 'page-url',
      idempotencyKey: 'live-refresh-1',
      requestFingerprint: expect.any(String),
      expiresInMs: 15 * 60_000,
    }));
  });

  it('keeps the full legacy navigation URL frozen while using a safe target identity', async () => {
    const { service, attempts } = createHarness();
    const pageUrl = `${PAGE_URL}?token=must-persist-for-navigation#private`;

    await service.beginBrowser({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'live-token-redaction',
      url: pageUrl,
    });

    const input = attempts.beginAttempt.mock.calls[0][0];
    expect(input.plan).toEqual(expect.objectContaining({ pageUrl }));
    expect(input.targetKey).not.toContain('must-persist-for-navigation');
    expect(input.targetKey).not.toContain('#private');
  });

  it('fails a mismatched page URL instead of publishing a partial browser generation', async () => {
    const { service, attempts } = createHarness();

    await expect(service.completeBrowser({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        source: 'douyin',
        pageUrl: 'https://live.douyin.com/other',
        broadcast: { broadcastId: 'broadcast-123' },
        products: [],
      },
    })).resolves.toMatchObject({ state: 'FAILED' });

    expect(attempts.completeAttempt).not.toHaveBeenCalled();
    expect(attempts.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SOURCE_PLAN_MISMATCH',
    }));
  });

  /**
   * The failure path recovers the alert descriptor from the stored attempt,
   * while begin and complete build it from the plan. It used to answer douyin
   * for any key that was not `1688.live_commerce`, so a third source would have
   * failed under douyin's dedupe key and left douyin's alert open forever.
   */
  it('recovers each source own alert identity from the stored attempt key', async () => {
    const { service, attempts } = createHarness();
    attempts.readAttempt = vi.fn(async () => ({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      sourceKey: '1688.live_commerce',
    })) as never;

    await service.failBrowser({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      code: 'SOURCE_COLLECTION_FAILED',
      message: '수집에 실패했습니다.',
    }).catch(() => undefined);

    const call = (attempts.failAttempt as unknown as { mock: { calls: [{ failureAlert?: { dedupeKey: string } }][] } }).mock.calls.at(-1);
    expect(call?.[0].failureAlert?.dedupeKey).toBe('source:1688-live-commerce');
  });

  it('submits the single frozen broadcast and its products only through the source-owner terminal', async () => {
    const { service, attempts } = createHarness();

    await expect(service.completeBrowser({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        source: 'douyin',
        pageUrl: PAGE_URL,
        broadcast: { broadcastId: 'broadcast-123', title: '방송' },
        products: [{ productId: 'product-1', title: '완구', rank: 1 }],
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
            kind: 'live_commerce_broadcast',
            row: expect.objectContaining({ ingestionRunId: ATTEMPT_ID, broadcastId: 'broadcast-123' }),
          }),
          expect.objectContaining({
            kind: 'live_commerce_product',
            row: expect.objectContaining({ ingestionRunId: ATTEMPT_ID, productId: 'product-1' }),
          }),
        ]),
      }),
    }));
  });
});
