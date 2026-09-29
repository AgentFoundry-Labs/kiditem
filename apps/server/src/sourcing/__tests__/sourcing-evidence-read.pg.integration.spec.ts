import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import { sourcingExtensionOperations } from '../../test-helpers/sourcing-extension-operations';
import { SourcingEvidenceLedgerRepositoryAdapter } from '../adapter/out/persistence/sourcing-evidence-ledger.repository';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

describe('Sourcing evidence reads from source owner publications (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let observations: SourcingEvidenceLedgerRepositoryAdapter;
  let operations: ReturnType<typeof sourcingExtensionOperations>;

  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const db = prisma as unknown as PrismaService;
    observations = new SourcingEvidenceLedgerRepositoryAdapter(db);
    operations = sourcingExtensionOperations(prisma, unusedSalesProductDraftPort);
    await prisma.trendSeedKeyword.create({ data: { organizationId: TEST_ORGANIZATION_ID, keyword: '연필', keywordCn: '铅笔', sources: ['1688'] } });
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
