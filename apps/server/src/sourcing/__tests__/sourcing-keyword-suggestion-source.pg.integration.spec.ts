import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
        new SourceFailureAlerts(prisma as never), unusedSalesProductDraftPort),
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
      ready: true, actualCutoffAt: new Date(batch.capturedAt),
      latestComplete: { attemptId: first.attemptId }, latestAttempt: { state: 'FAILED' },
    });
    await expect(service.snapshot({ organizationId, keyword: 'A Pencil' })).resolves.toMatchObject({ items: batch.items });
    await expect(prisma.alert.findMany({ where: { organizationId, type: 'source_failure' } }))
      .resolves.toMatchObject([{ status: 'OPEN', attemptId: refresh.attemptId }]);
    const retry = await begin('retry');
    await service.complete({ organizationId, attemptId: retry.attemptId, attemptToken: retry.attemptToken,
      batch: { ...batch, items: [], productNameTokens: [] } });
    await expect(service.snapshot({ organizationId, keyword: 'A Pencil' })).resolves.toMatchObject({
      generatedAt: batch.capturedAt,
      items: [],
      productNameTokens: [],
    });
    await expect(prisma.alert.findMany({ where: { organizationId, type: 'source_failure' } }))
      .resolves.toMatchObject([{ status: 'RESOLVED' }]);
    expect((await prisma.$queryRaw<Array<{ absent: boolean }>>`
      SELECT to_regclass('public.operation_runs') IS NULL AS absent
    `)[0]?.absent).toBe(true);
    await expect(prisma.masterProductAbcEvaluation.count()).resolves.toEqual(abcBefore);
  });

  it('does not recover a historical COMPLETE suggestion from retained raw evidence', async () => {
    const first = await begin('missing-typed-publication');
    await service.complete({
      organizationId,
      attemptId: first.attemptId,
      attemptToken: first.attemptToken,
      batch,
    });
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(1);
    await prisma.sourcingKeywordSuggestionFact.deleteMany({ where: { organizationId } });

    await expect(service.snapshot({ organizationId, keyword: 'A Pencil' })).resolves.toMatchObject({
      generatedAt: null,
      items: [],
      productNameTokens: [],
    });
  });

  it('organization-scopes typed facts and withholds a superseded observation revision', async () => {
    const first = await begin('revision-fence');
    await service.complete({
      organizationId,
      attemptId: first.attemptId,
      attemptToken: first.attemptToken,
      batch,
    });
    await expect(service.snapshot({ organizationId: randomUUID(), keyword: 'A Pencil' }))
      .resolves.toMatchObject({ generatedAt: null, items: [] });
    const original = await prisma.sourcingEvidenceObservation.findFirstOrThrow({
      where: { organizationId, operationId: first.attemptId },
    });
    await prisma.sourcingEvidenceObservation.create({
      data: {
        organizationId,
        operationId: original.operationId,
        supersedesObservationId: original.id,
        sourceKey: original.sourceKey,
        platform: original.platform,
        evidenceFamily: original.evidenceFamily,
        signalRole: original.signalRole,
        conceptKey: original.conceptKey,
        supportsCandidate: original.supportsCandidate,
        observationKey: original.observationKey,
        revision: 2,
        sourceEntityType: original.sourceEntityType,
        sourceEntityKey: original.sourceEntityKey,
        observationType: original.observationType,
        schemaVersion: original.schemaVersion,
        evidenceClass: original.evidenceClass,
        eventAt: original.eventAt,
        observedAt: original.observedAt,
        availableAt: original.availableAt,
        revisionAt: new Date(),
        payloadHash: 'a'.repeat(64),
        envelopeHash: 'b'.repeat(64),
        ingestedAt: new Date(),
      },
    });

    await expect(service.snapshot({ organizationId, keyword: 'A Pencil' }))
      .resolves.toMatchObject({ generatedAt: null, items: [] });
  });

  function begin(idempotencyKey: string) {
    return service.begin({ organizationId, requestedByUserId: TEST_USER_ID, idempotencyKey,
      input: { keyword: '  Ａ   Pencil ', maxResults: 30 } });
  }
});
