import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { SourcingKeywordSuggestionRepositoryAdapter } from '../adapter/out/repository/sourcing-keyword-suggestion.repository.adapter';
import { SourcingKeywordSuggestionService } from '../application/service/sourcing-keyword-suggestion.service';
import type { PrismaClient } from '@prisma/client';

const organizationId = TEST_ORGANIZATION_ID;
const batch = { keyword: 'A Pencil', capturedAt: '2026-09-05T03:00:00.000Z',
  items: [{ rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' }],
  productNameTokens: [{ keyword: '연필', count: 4 }] };

describe('Keyword suggestion public source owner (disposable PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: SourcingKeywordSuggestionService;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new SourcingKeywordSuggestionService(
      new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never,
        new SourceFailureAlerts(new AlertsRepository(prisma as never))),
      new SourcingKeywordSuggestionRepositoryAdapter(prisma as never),
    );
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('publishes current COMPLETE, preserves it on failed refresh, and resolves its source Alert on retry without Operations or ABC', async () => {
    const abcBefore = await prisma.masterProductAbcEvaluation.count();
    const first = await begin('first');
    await expect(begin('first')).resolves.toEqual(first);
    const complete = await service.complete({ organizationId, attemptId: first.attemptId,
      attemptToken: first.attemptToken, batch });
    expect(complete.state).toBe('COMPLETE');
    await expect(service.complete({ organizationId, attemptId: first.attemptId,
      attemptToken: first.attemptToken, batch })).resolves.toEqual(complete);
    await expect(service.snapshot({ organizationId, keyword: ' Ａ Pencil ' })).resolves.toMatchObject({
      generatedAt: batch.capturedAt, items: batch.items, productNameTokens: batch.productNameTokens,
    });
    const refresh = await begin('refresh');
    await service.fail({ organizationId, attemptId: refresh.attemptId,
      attemptToken: refresh.attemptToken, code: 'SOURCE_COLLECTION_FAILED', message: 'provider failed' });
    await expect(service.status({ organizationId, keyword: 'A Pencil' })).resolves.toMatchObject({
      status: 'STALE', actualCutoffAt: new Date(batch.capturedAt),
      latestComplete: { attemptId: first.attemptId }, latestAttempt: { state: 'FAILED' },
    });
    await expect(service.snapshot({ organizationId, keyword: 'A Pencil' })).resolves.toMatchObject({ items: batch.items });
    await expect(prisma.alert.findMany({ where: { organizationId, type: 'source_failure' } }))
      .resolves.toMatchObject([{ status: 'OPEN', attemptId: refresh.attemptId }]);
    const retry = await begin('retry');
    await service.complete({ organizationId, attemptId: retry.attemptId, attemptToken: retry.attemptToken,
      batch: { ...batch, items: [], productNameTokens: [] } });
    await expect(service.snapshot({ organizationId, keyword: 'A Pencil' })).resolves.toMatchObject({ items: [] });
    await expect(prisma.alert.findMany({ where: { organizationId, type: 'source_failure' } }))
      .resolves.toMatchObject([{ status: 'RESOLVED' }]);
    expect((await prisma.$queryRaw<Array<{ absent: boolean }>>`
      SELECT to_regclass('public.operation_runs') IS NULL AS absent
    `)[0]?.absent).toBe(true);
    await expect(prisma.alert.count({ where: { kind: 'operation' } })).resolves.toBe(0);
    await expect(prisma.masterProductAbcEvaluation.count()).resolves.toEqual(abcBefore);
  });

  function begin(idempotencyKey: string) {
    return service.begin({ organizationId, requestedByUserId: TEST_USER_ID, idempotencyKey,
      input: { keyword: '  Ａ   Pencil ', maxResults: 30 } });
  }
});
