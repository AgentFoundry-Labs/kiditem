import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import { sourcingExtensionOperations } from '../../test-helpers/sourcing-extension-operations';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { SourcingEvidenceLedgerRepositoryAdapter } from '../adapter/out/repository/sourcing-evidence-ledger.repository.adapter';
import { SourcingEvidenceLedgerService } from '../application/service/sourcing-evidence-ledger.service';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

describe('Sourcing evidence reads from source owner publications (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let owner: SourcingBrowserSourceAttemptRepositoryAdapter;
  let evidence: SourcingEvidenceLedgerService;
  let observations: SourcingEvidenceLedgerRepositoryAdapter;
  let operations: ReturnType<typeof sourcingExtensionOperations>;

  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => prisma?.$disconnect());
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const db = prisma as unknown as PrismaService;
    owner = new SourcingBrowserSourceAttemptRepositoryAdapter(db, new SourceFailureAlerts(db), unusedSalesProductDraftPort);
    observations = new SourcingEvidenceLedgerRepositoryAdapter(db);
    evidence = new SourcingEvidenceLedgerService(owner);
    operations = sourcingExtensionOperations(prisma, unusedSalesProductDraftPort);
    await prisma.trendSeedKeyword.create({ data: { organizationId: TEST_ORGANIZATION_ID, keyword: '연필', keywordCn: '铅笔', sources: ['1688'] } });
  });

  /** 서버 구동 원천(KID-360 I-b 전까지 run 표)의 시도. */
  async function beginServerAttempt(key: string) {
    const plan = { source: 'naver.keyword_analysis', inputHash: key };
    return (await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID, sourceKey: 'naver.keyword_analysis', scopeKey: 'default', targetKey: key,
      idempotencyKey: key, requestFingerprint: key.padEnd(64, '0'), plan, planChecksum: key.padEnd(64, '1'),
      requestedByUserId: null, collectorKey: 'evidence-read-test', collectorVersion: 'v1', expiresInMs: 60_000,
      failureAlert: { sourceType: 'naver.keyword_analysis', dedupeKey: `source:${key}`, title: 't', href: '/' },
    })).attempt;
  }

  it('returns COMPLETE provenance for a server-driven source attempt', async () => {
    const attempt = await beginServerAttempt('evidence-read');
    await owner.completeAttempt({ organizationId: TEST_ORGANIZATION_ID, attemptId: attempt.attemptId, attemptToken: attempt.attemptToken,
      planChecksum: attempt.planChecksum, contentChecksum: 'c'.repeat(64),
      output: { observations: [], typedRecords: [], discoveredCount: 0, rejectedCount: 0, qualityReport: {} } });

    await expect(evidence.getRun(TEST_ORGANIZATION_ID, attempt.attemptId)).resolves.toMatchObject({
      attemptId: attempt.attemptId, sourceKey: 'naver.keyword_analysis', state: 'COMPLETE', acceptedCount: 0,
    });
    // 완결 run은 같은 트랜잭션에서 발행 1행이 된다(리더는 발행만 읽는다).
    await expect(prisma.sourcingSourcePublication.count({ where: { operationId: attempt.attemptId, isCurrent: true } })).resolves.toBe(1);
  });

  it('reports expired evidence attempts through the same owner state contract', async () => {
    const attempt = await beginServerAttempt('evidence-expired');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(attempt.expiresAt).getTime() + 1);

    await expect(evidence.getRun(TEST_ORGANIZATION_ID, attempt.attemptId)).resolves.toMatchObject({
      attemptId: attempt.attemptId, state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED',
    });
  });

  it('retains current supporting evidence through failure but does not revive it after an empty COMPLETE', async () => {
    const collect = (items: Array<Record<string, unknown>>) => operations.run(TEST_ORGANIZATION_ID, 'sourcing.trend_1688', {},
      (plan) => (plan.keywords as string[]).map((keyword) => ({
        chunkKind: 'offers_1688', payload: [{ keyword, items: keyword === '铅笔' ? items : [] }],
      })));
    const baseline = await collect([{ offerId: 'evidence-offer', title: '연필' }]);
    const readSupporting = () => observations.findCandidateSupportingObservations({
      organizationId: TEST_ORGANIZATION_ID, platform: '1688', sourceEntityIds: ['evidence-offer'], cutoffAt: new Date(),
    });
    const [original] = await readSupporting();
    expect(original).toMatchObject({ operationId: baseline.operation.id, ingestionRunStatus: 'COMPLETE' });
    // 범위를 채우지 못한 수집은 failed로 끝나고 현재 발행을 건드리지 않는다.
    const refresh = await operations.run(TEST_ORGANIZATION_ID, 'sourcing.trend_1688', {}, []);
    expect(refresh.refusedWith).toBe('SOURCING_COLLECTION_INCOMPLETE');
    await expect(readSupporting()).resolves.toHaveLength(1);
    await collect([]);
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
