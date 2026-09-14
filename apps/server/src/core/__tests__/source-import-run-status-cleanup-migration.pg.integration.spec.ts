import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import {
  ensureSourceImportRunStatusCheck,
  SOURCE_IMPORT_RUN_STATUS_CHECK,
} from '../../../../../scripts/data-migrations/helpers/source-import-run-status-check';
import {
  constrainSourceImportRunStatusMigration,
  SOURCE_IMPORT_RUN_CLEANUP_STEPS,
  type SourceImportRunCleanupDetails,
} from '../../../../../scripts/data-migrations/v0.1.31/012_constrain_source_import_run_status';

const ORG = TEST_ORGANIZATION_ID;

/**
 * The pre-schema migration runs while source_import_runs has no status
 * constraint. It deletes runs whose status is outside the set with what they
 * collected, keeps carried-forward rows, adds the constraint, and every later
 * run is a zero-row no-op.
 */
describe('v0.1.31:012 constrain SourceImportRun status (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    // The shape before the cutover: nothing stops an unknown status.
    await prisma.$executeRaw`ALTER TABLE source_import_runs DROP CONSTRAINT IF EXISTS source_import_runs_status_check`;
  });

  afterEach(async () => {
    // Later suites share this database, so restore the pushed shape.
    await resetDb(prisma);
    await prisma.$transaction((tx) => ensureSourceImportRunStatusCheck(tx));
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('deletes unknown-status runs with what they collected, keeps carried-forward rows, and re-runs as a no-op', async () => {
    const account = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'KID-124 cleanup account' },
    });
    const completed = await createRun('completed');
    const running = await createRun('running');
    const failed = await createRun('failed');
    const superseded = await createRun('superseded');
    const receiptRun = await createRun('published');

    // What the unknown run collected.
    await prisma.orderCollectionArtifact.create({
      data: {
        organizationId: ORG,
        sourceImportRunId: superseded.id,
        sourceContentType: 'text/csv',
        sourceBytes: new TextEncoder().encode('synthetic capture'),
      },
    });
    await sellpiaSalesDay(superseded.id);
    await prisma.review.create({
      data: { organizationId: ORG, sourceImportRunId: superseded.id, rating: 5 },
    });
    const rawSnapshot = await prisma.channelScrapeSnapshot.create({
      data: {
        organizationId: ORG,
        sourceImportRunId: superseded.id,
        channel: 'coupang',
        source: 'wing',
        pageType: 'traffic',
        rawJson: {},
      },
    });
    // Carried-forward rows that point at it.
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        externalId: 'kid124-listing',
        lastImportRunId: superseded.id,
      },
    });
    const listingDay = await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date('2026-09-01T00:00:00.000Z'),
        rawSnapshotId: rawSnapshot.id,
      },
    });
    const unknownRunOrder = await createOrder(account.id, 'kid124-unknown-run-order', superseded.id);
    await prisma.masterProductAbcFormulaState.create({
      data: {
        organizationId: ORG,
        publicationRevision: 3,
        officialCutoffDate: new Date('2026-08-31T00:00:00.000Z'),
        publishedSellpiaSourceImportRunId: superseded.id,
        publishedAdvertisingSourceImportRunId: completed.id,
        publishedMappingGeneration: 7n,
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    // A transport receipt is carried forward with its run.
    const receipt = await prisma.coupangDirectTransportReceipt.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        effectSourceImportRunId: receiptRun.id,
        transport: 'SHIPMENT',
        payloadChecksum: 'a'.repeat(64),
        collectedLines: [],
        matchedLines: [],
        unmatchedLines: [],
      },
    });
    // A current run keeps everything.
    const completedRunOrder = await createOrder(account.id, 'kid124-completed-run-order', completed.id);
    await sellpiaSalesDay(completed.id);

    const first = await runMigration();
    const firstDetails = first.details as SourceImportRunCleanupDetails;
    expect(first.affectedRows).toBe(10);
    expect(firstDetails).toMatchObject({
      allowedStatuses: ['running', 'completed', 'failed'],
      unknownStatuses: [
        { status: 'published', runs: 1 },
        { status: 'superseded', runs: 1 },
      ],
      failedCarriedForwardRuns: 1,
      deletedRuns: 1,
      statusCheck: 'created',
    });
    expect(nonZero(firstDetails.deletedRows)).toEqual({
      channel_scrape_snapshots: 1,
      sellpia_sales_daily_snapshots: 1,
      order_collection_artifacts: 1,
      reviews: 1,
    });
    expect(nonZero(firstDetails.clearedReferences)).toEqual({
      'channel_listing_daily_snapshots.raw_snapshot_id': 1,
      'master_product_abc_formula_states.published_sellpia_source_import_run_id': 1,
      'orders.source_import_run_id': 1,
      'channel_listings.last_import_run_id': 1,
    });

    const runs = await prisma.sourceImportRun.findMany({
      where: { organizationId: ORG },
      select: { id: true, status: true },
    });
    expect(new Map(runs.map((run) => [run.id, run.status]))).toEqual(new Map([
      [completed.id, 'completed'],
      [running.id, 'running'],
      [failed.id, 'failed'],
      [receiptRun.id, 'failed'],
    ]));
    await expect(prisma.coupangDirectTransportReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
      select: { effectSourceImportRunId: true },
    })).resolves.toEqual({ effectSourceImportRunId: receiptRun.id });

    const orders = await prisma.order.findMany({
      where: { organizationId: ORG },
      select: { id: true, sourceImportRunId: true },
    });
    expect(new Map(orders.map((order) => [order.id, order.sourceImportRunId]))).toEqual(new Map([
      [unknownRunOrder.id, null],
      [completedRunOrder.id, completed.id],
    ]));
    await expect(prisma.channelListing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { lastImportRunId: true },
    })).resolves.toEqual({ lastImportRunId: null });
    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: { id: listingDay.id },
      select: { rawSnapshotId: true },
    })).resolves.toEqual({ rawSnapshotId: null });
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId: ORG },
      select: {
        publicationRevision: true,
        officialCutoffDate: true,
        publishedSellpiaSourceImportRunId: true,
        publishedAdvertisingSourceImportRunId: true,
        publishedMappingGeneration: true,
        publishedAt: true,
      },
    })).resolves.toEqual({
      publicationRevision: 3,
      officialCutoffDate: null,
      publishedSellpiaSourceImportRunId: null,
      publishedAdvertisingSourceImportRunId: null,
      publishedMappingGeneration: null,
      publishedAt: null,
    });
    await expect(prisma.sellpiaSalesDailySnapshot.findMany({
      where: { organizationId: ORG },
      select: { sourceImportRunId: true },
    })).resolves.toEqual([{ sourceImportRunId: completed.id }]);
    await expect(Promise.all([
      prisma.orderCollectionArtifact.count(),
      prisma.review.count(),
      prisma.channelScrapeSnapshot.count(),
    ])).resolves.toEqual([0, 0, 0]);
    await expect(createRun('complete')).rejects.toThrow(SOURCE_IMPORT_RUN_STATUS_CHECK);

    const second = await runMigration();
    const secondDetails = second.details as SourceImportRunCleanupDetails;
    expect(second.affectedRows).toBe(0);
    expect(secondDetails).toMatchObject({
      unknownStatuses: [],
      failedCarriedForwardRuns: 0,
      deletedRuns: 0,
      statusCheck: 'unchanged',
    });
    expect(nonZero(secondDetails.deletedRows)).toEqual({});
    expect(nonZero(secondDetails.clearedReferences)).toEqual({});
  });

  it('re-creates a constraint that differs or was never validated and keeps the current one', async () => {
    await prisma.$executeRaw`
      ALTER TABLE source_import_runs
      ADD CONSTRAINT source_import_runs_status_check CHECK (status IN ('running', 'completed'))
    `;
    await createRun('completed');

    await expect(runMigration()).resolves.toMatchObject({
      affectedRows: 0,
      details: { deletedRuns: 0, statusCheck: 'recreated' },
    });
    await expect(createRun('failed')).resolves.toMatchObject({ status: 'failed' });

    await prisma.$executeRaw`ALTER TABLE source_import_runs DROP CONSTRAINT source_import_runs_status_check`;
    await prisma.$executeRaw`
      ALTER TABLE source_import_runs
      ADD CONSTRAINT source_import_runs_status_check
      CHECK (status IN ('running', 'completed', 'failed')) NOT VALID
    `;
    await expect(runMigration()).resolves.toMatchObject({
      affectedRows: 0,
      details: { statusCheck: 'recreated' },
    });
    await expect(runMigration()).resolves.toMatchObject({
      affectedRows: 0,
      details: { statusCheck: 'unchanged' },
    });
    await expect(prisma.$queryRaw`
      SELECT convalidated FROM pg_constraint
      WHERE conrelid = 'public.source_import_runs'::regclass
        AND conname = ${SOURCE_IMPORT_RUN_STATUS_CHECK}
    `).resolves.toEqual([{ convalidated: true }]);
  });

  it('skips a table a later schema step already removed', async () => {
    const superseded = await createRun('superseded');
    const rollback = new Error('roll back the table-absent probe');
    let result: SourceImportRunCleanupDetails | undefined;

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE sellpia_sales_daily_snapshots RENAME TO kid124_sellpia_sales_absent_probe`;
      result = (await constrainSourceImportRunStatusMigration.run(tx)).details as SourceImportRunCleanupDetails;
      throw rollback;
    }, { timeout: 30_000 })).rejects.toBe(rollback);

    expect(result).toMatchObject({ deletedRuns: 1, statusCheck: 'created' });
    expect(result?.deletedRows).not.toHaveProperty('sellpia_sales_daily_snapshots');
    expect(result?.deletedRows).toHaveProperty('order_collection_artifacts', 0);
    await expect(prisma.sourceImportRun.findUnique({
      where: { id: superseded.id },
      select: { status: true },
    })).resolves.toEqual({ status: 'superseded' });
  });

  it('has a step for every foreign key into source_import_runs or a table it empties by run', async () => {
    const emptiedByRun = SOURCE_IMPORT_RUN_CLEANUP_STEPS
      .filter((step) => step.action === 'delete' && step.references === 'source_import_runs')
      .map((step) => step.table);
    const foreignKeys = await prisma.$queryRaw<Array<{
      child_table: string;
      child_columns: string[];
      parent_table: string;
    }>>`
      SELECT
        child.relname::text AS child_table,
        parent.relname::text AS parent_table,
        ARRAY(
          SELECT attribute.attname::text
          FROM unnest(foreign_key.conkey) AS key(attnum)
          JOIN pg_attribute attribute
            ON attribute.attrelid = foreign_key.conrelid
           AND attribute.attnum = key.attnum
        ) AS child_columns
      FROM pg_constraint foreign_key
      JOIN pg_class child ON child.oid = foreign_key.conrelid
      JOIN pg_class parent ON parent.oid = foreign_key.confrelid
      JOIN pg_namespace namespace ON namespace.oid = parent.relnamespace
      WHERE foreign_key.contype = 'f'
        AND namespace.nspname = 'public'
        AND parent.relname::text IN (${Prisma.join(['source_import_runs', ...emptiedByRun])})
    `;
    const declared = new Set(SOURCE_IMPORT_RUN_CLEANUP_STEPS.map((step) =>
      `${step.table}.${step.column} -> ${step.references}`));
    const references = foreignKeys.map((foreignKey) => {
      const columns = foreignKey.child_columns.filter((column) => column !== 'organization_id');
      return `${foreignKey.child_table}.${columns.join('+')} -> ${foreignKey.parent_table}`;
    });

    expect(references.length).toBeGreaterThan(30);
    expect(references.filter((reference) => !declared.has(reference))).toEqual([]);
  });

  function createRun(status: string) {
    return prisma.sourceImportRun.create({
      data: { organizationId: ORG, sourceType: 'kid124_cleanup_probe', status },
    });
  }

  function createOrder(channelAccountId: string, externalOrderId: string, sourceImportRunId: string) {
    return prisma.order.create({
      data: { organizationId: ORG, channelAccountId, externalOrderId, sourceImportRunId },
    });
  }

  function sellpiaSalesDay(sourceImportRunId: string) {
    return prisma.sellpiaSalesDailySnapshot.create({
      data: {
        organizationId: ORG,
        sourceImportRunId,
        businessDate: new Date('2026-09-01T00:00:00.000Z'),
        sellerId: '1',
        sellerName: 'Synthetic seller',
        channelGroup: 'others',
      },
    });
  }

  function runMigration() {
    return prisma.$transaction(
      (tx) => constrainSourceImportRunStatusMigration.run(tx),
      { timeout: 30_000 },
    );
  }
});

function nonZero(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count !== 0));
}
