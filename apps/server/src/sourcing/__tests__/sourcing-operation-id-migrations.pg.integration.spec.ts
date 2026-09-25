import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  renameSourcingIngestionRunIdsMigration,
  SOURCING_OPERATION_ID_INDEX_RENAMES,
  SOURCING_OPERATION_ID_TABLES,
} from '../../../../../scripts/data-migrations/v0.1.31/030_rename_sourcing_ingestion_run_ids_to_operation_ids';
import { publishCompleteSourcingRunsMigration } from '../../../../../scripts/data-migrations/v0.1.31/031_publish_complete_sourcing_runs';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';

/**
 * KID-360: 원장 12표의 `ingestion_run_id`가 스칼라 `operation_id`가 된다(030, 스키마 단계 전). 옛 COMPLETE run은
 * 발행 이력 표로 옮긴다(031, 스키마 단계 뒤). 두 마이그레이션 모두 다시 돌리면 아무것도 바꾸지 않는다.
 */
describe('030/031 sourcing operation ids and publications (PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  class Rollback extends Error {}

  /** 테스트 DB를 옛 모양(ingestion_run_id + 옛 인덱스 이름)으로 되돌린 뒤 `work`를 돌리고 모두 되감는다. */
  async function onOldShape(work: (tx: Prisma.TransactionClient) => Promise<void>) {
    await expect(prisma.$transaction(async (tx) => {
      for (const table of SOURCING_OPERATION_ID_TABLES) {
        await tx.$executeRaw`ALTER TABLE ${Prisma.raw(`"${table}"`)} RENAME COLUMN operation_id TO ingestion_run_id`;
      }
      for (const [oldName, newName] of Object.entries(SOURCING_OPERATION_ID_INDEX_RENAMES)) {
        await tx.$executeRaw`ALTER INDEX ${Prisma.raw(`"${newName}"`)} RENAME TO ${Prisma.raw(`"${oldName}"`)}`;
      }
      await work(tx);
      throw new Rollback();
    })).rejects.toBeInstanceOf(Rollback);
  }

  async function columnsNamed(tx: Prisma.TransactionClient, column: string) {
    const rows = await tx.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = ${column}
        AND table_name IN (${Prisma.join([...SOURCING_OPERATION_ID_TABLES])})
      ORDER BY table_name`;
    return rows.map((row) => row.table_name);
  }

  it('renames every ledger column and index to the names Prisma expects, keeps the run id values, and then does nothing', async () => {
    await onOldShape(async (tx) => {
      const runId = '11111111-1111-4111-8111-111111111111';
      await tx.$executeRaw`
        INSERT INTO naver_keyword_daily_snapshots (id, organization_id, ingestion_run_id, keyword, business_date, captured_at, updated_at)
        VALUES (gen_random_uuid(), ${ORG}::uuid, ${runId}::uuid, '장난감', '2026-09-24', now(), now())`;

      const first = await renameSourcingIngestionRunIdsMigration.run(tx);
      expect(first.details.renamedColumns).toEqual([...SOURCING_OPERATION_ID_TABLES]);
      expect(first.details.renamedIndexes).toEqual(Object.values(SOURCING_OPERATION_ID_INDEX_RENAMES));

      await expect(columnsNamed(tx, 'ingestion_run_id')).resolves.toEqual([]);
      await expect(columnsNamed(tx, 'operation_id')).resolves.toEqual([...SOURCING_OPERATION_ID_TABLES].sort());
      const [row] = await tx.$queryRaw<Array<{ operation_id: string }>>`SELECT operation_id FROM naver_keyword_daily_snapshots`;
      expect(row.operation_id).toBe(runId);

      await expect(renameSourcingIngestionRunIdsMigration.run(tx)).resolves.toEqual({
        affectedRows: 0,
        details: { renamedColumns: [], renamedIndexes: [] },
      });
    });
  });

  it('skips tables that do not exist yet (Office 0.1.30 has no fact tables)', async () => {
    await onOldShape(async (tx) => {
      await tx.$executeRaw`DROP TABLE sourcing_wing_catalog_product_facts`;
      const result = await renameSourcingIngestionRunIdsMigration.run(tx);
      expect(result.details.renamedColumns).not.toContain('sourcing_wing_catalog_product_facts');
      expect(result.details.renamedColumns).toHaveLength(SOURCING_OPERATION_ID_TABLES.length - 1);
    });
  });

  it('publishes each complete run once, current where the run was current complete, and ignores running or failed runs', async () => {
    const run = (status: string, isCurrentComplete: boolean, targetKey: string, completedAt: Date | null) =>
      prisma.sourcingEvidenceIngestionRun.create({
        data: {
          organizationId: ORG,
          sourceKey: '1688.hot_product',
          scopeKey: 'default',
          targetKey,
          idempotencyKey: `${targetKey}-${status}-${isCurrentComplete}`,
          requestHash: 'a'.repeat(64),
          collectorKey: 'collector',
          collectorVersion: 'v1',
          triggerKind: 'manual',
          status,
          isCurrentComplete,
          attemptPlan: { keywords: ['장난감'] },
          sourceWindowStartAt: new Date('2026-09-24T00:00:00Z'),
          sourceWindowEndAt: new Date('2026-09-24T01:00:00Z'),
          acceptedCount: 3,
          coverageNumerator: 1,
          coverageDenominator: 1,
          qualityReport: { note: 'ok' },
          completedAt,
        },
      });
    const current = await run('COMPLETE', true, 'all', new Date('2026-09-24T02:00:00Z'));
    const older = await run('COMPLETE', false, 'all', new Date('2026-09-23T02:00:00Z'));
    await run('FAILED', false, 'all', new Date('2026-09-24T03:00:00Z'));
    await run('RUNNING', false, 'other', null);

    await expect(prisma.$transaction((tx) => publishCompleteSourcingRunsMigration.run(tx)))
      .resolves.toEqual({ affectedRows: 2, details: { published: 2 } });
    const publications = await prisma.sourcingSourcePublication.findMany({ orderBy: { completedAt: 'desc' } });
    expect(publications.map((row) => [row.operationId, row.isCurrent])).toEqual([[current.id, true], [older.id, false]]);
    expect(publications[0]).toMatchObject({
      organizationId: ORG,
      sourceKey: '1688.hot_product',
      scopeKey: 'default',
      targetKey: 'all',
      plan: { keywords: ['장난감'] },
      windowStartAt: new Date('2026-09-24T00:00:00Z'),
      windowEndAt: new Date('2026-09-24T01:00:00Z'),
      acceptedCount: 3,
      coverageNumerator: 1,
      coverageDenominator: 1,
      qualityReport: { note: 'ok' },
      completedAt: new Date('2026-09-24T02:00:00Z'),
    });

    await expect(prisma.$transaction((tx) => publishCompleteSourcingRunsMigration.run(tx)))
      .resolves.toEqual({ affectedRows: 0, details: { published: 0 } });
  });
});
