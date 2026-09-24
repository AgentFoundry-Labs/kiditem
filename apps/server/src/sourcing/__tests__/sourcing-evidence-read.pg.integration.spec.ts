import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptController } from '../adapter/in/http/sourcing-browser-source-attempt.controller';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { SourcingEvidenceLedgerRepositoryAdapter } from '../adapter/out/repository/sourcing-evidence-ledger.repository.adapter';
import { SourcingBrowserSourceAttemptService } from '../application/service/sourcing-browser-source-attempt.service';
import { SourcingEvidenceLedgerService } from '../application/service/sourcing-evidence-ledger.service';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '../../auth/auth.types';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TrendCollectService } from '../application/service/trend-collect.service';

describe('Sourcing evidence reads from source owner publications (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let writer: SourcingBrowserSourceAttemptController;
  let evidence: SourcingEvidenceLedgerService;
  let observations: SourcingEvidenceLedgerRepositoryAdapter;

  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => prisma?.$disconnect());
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const db = prisma as unknown as PrismaService;
    const owner = new SourcingBrowserSourceAttemptRepositoryAdapter(db,
      new SourceFailureAlerts(db), unusedSalesProductDraftPort);
    writer = new SourcingBrowserSourceAttemptController(new SourcingBrowserSourceAttemptService(owner,
      { list1688Targets: async () => [{ label: '연필', keyword: '铅笔' }] } as unknown as TrendCollectService));
    observations = new SourcingEvidenceLedgerRepositoryAdapter(db);
    evidence = new SourcingEvidenceLedgerService(owner);
  });

  it('returns COMPLETE provenance for a source-owner publication', async () => {
    const attempt = await writer.begin1688(TEST_ORGANIZATION_ID, { id: TEST_USER_ID } as AuthUser, 'evidence-read');
    await writer.complete1688(attempt.attemptId, attempt.attemptToken,
      { keywords: [{ keyword: '铅笔', items: [] }] }, TEST_ORGANIZATION_ID);

    await expect(evidence.getRun(TEST_ORGANIZATION_ID, attempt.attemptId)).resolves.toMatchObject({
      attemptId: attempt.attemptId, sourceKey: '1688.hot_product', state: 'COMPLETE', acceptedCount: 0,
    });
  });

  it('reports expired evidence attempts through the same owner state contract', async () => {
    const attempt = await writer.begin1688(TEST_ORGANIZATION_ID, { id: TEST_USER_ID } as AuthUser, 'evidence-expired');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(attempt.expiresAt).getTime() + 1);

    await expect(evidence.getRun(TEST_ORGANIZATION_ID, attempt.attemptId)).resolves.toMatchObject({
      attemptId: attempt.attemptId, state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED',
    });
  });

  it('retains current supporting evidence through failure but does not revive it after an empty COMPLETE', async () => {
    const user = { id: TEST_USER_ID } as AuthUser;
    const baseline = await writer.begin1688(TEST_ORGANIZATION_ID, user, 'evidence-baseline');
    await writer.complete1688(baseline.attemptId, baseline.attemptToken,
      { keywords: [{ keyword: '铅笔', items: [{ offerId: 'evidence-offer', title: '연필' }] }] }, TEST_ORGANIZATION_ID);
    const readSupporting = () => observations.findCandidateSupportingObservations({
      organizationId: TEST_ORGANIZATION_ID, platform: '1688', sourceEntityIds: ['evidence-offer'], cutoffAt: new Date(),
    });
    const [original] = await readSupporting();
    expect(original).toMatchObject({ ingestionRunId: baseline.attemptId, ingestionRunStatus: 'COMPLETE' });
    const refresh = await writer.begin1688(TEST_ORGANIZATION_ID, user, 'evidence-failed');
    await writer.fail1688(refresh.attemptId, refresh.attemptToken,
      { code: 'SOURCE_COLLECTION_FAILED', message: 'provider unavailable' }, TEST_ORGANIZATION_ID);
    await expect(readSupporting()).resolves.toHaveLength(1);
    const empty = await writer.begin1688(TEST_ORGANIZATION_ID, user, 'evidence-empty');
    await writer.complete1688(empty.attemptId, empty.attemptToken,
      { keywords: [{ keyword: '铅笔', items: [] }] }, TEST_ORGANIZATION_ID);
    await expect(readSupporting()).resolves.toEqual([]);
    await expect(observations.findLatestObservationRevisions({
      organizationId: TEST_ORGANIZATION_ID, observationKeys: [original.observationKey], cutoffAt: new Date(),
    })).resolves.toEqual([]);
    // Existing decisions can still identify their immutable COMPLETE provenance.
    await expect(observations.findObservationsByIds({
      organizationId: TEST_ORGANIZATION_ID, observationIds: [original.id],
    })).resolves.toMatchObject([{ id: original.id, ingestionRunStatus: 'COMPLETE' }]);
  });
});
