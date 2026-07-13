import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SellpiaMasterImportRepositoryAdapter } from '../adapter/out/repository/sellpia-master-import.repository.adapter';
import { SellpiaInventoryImportService } from '../application/service/sellpia-inventory-import.service';
import type { ParsedSellpiaInventoryRow } from '../application/service/sellpia-inventory-workbook.parser';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';

const REPRESENTATIVE_ROW_COUNT = 1_964;

describe('SellpiaMasterImportRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: SellpiaMasterImportRepositoryAdapter;
  let service: SellpiaInventoryImportService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new SellpiaMasterImportRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    service = new SellpiaInventoryImportService(repository);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('publishes a representative Sellpia snapshot directly to MasterProduct', async () => {
    const rows = makeRows(REPRESENTATIVE_ROW_COUNT);
    rows[0] = makeRow(0, {
      sellpiaProductCode: 'SP-DUP-A',
      name: '같은 이름',
      barcode: '001234567890',
    });
    rows[1] = makeRow(1, {
      sellpiaProductCode: 'SP-DUP-B',
      name: '같은 이름',
      barcode: '001234567890',
    });

    const result = await importSnapshot(rows, fileHash('representative'));
    const [masters, duplicateMetadataRows, run] = await Promise.all([
      prisma.masterProduct.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.masterProduct.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          code: { in: ['SP-DUP-A', 'SP-DUP-B'] },
        },
        orderBy: { code: 'asc' },
      }),
      prisma.sourceImportRun.findUniqueOrThrow({
        where: { id: result.run.id },
      }),
    ]);

    expect(masters).toBe(REPRESENTATIVE_ROW_COUNT);
    expect(duplicateMetadataRows).toHaveLength(2);
    expect(new Set(duplicateMetadataRows.map((row) => row.id))).toHaveLength(2);
    expect(result.changes).toEqual({
      createdMasterProductCount: REPRESENTATIVE_ROW_COUNT,
      updatedMasterProductCount: 0,
      inactivatedMasterProductCount: 0,
    });
    expect(run.publicationSequence).toBe(1n);
  });

  it('copies final Sellpia fields to the MasterProduct stock owner', async () => {
    const row = makeRow(7, {
      sellpiaProductCode: 'SP-SOURCE-FIELDS',
      name: '소스 상품명',
      optionName: '블루',
      barcode: '001234567890',
      currentStock: 17,
      purchasePrice: 1_200,
      salePrice: 2_300,
      rawJson: { source: 'sellpia' },
    });

    const result = await importSnapshot([row], fileHash('source-fields'));
    const master = await prisma.masterProduct.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        code: row.sellpiaProductCode,
      },
    });

    expect(master).toMatchObject({
      code: row.sellpiaProductCode,
      name: row.name,
      optionName: row.optionName,
      barcode: row.barcode,
      currentStock: row.currentStock,
      purchasePrice: row.purchasePrice,
      salePrice: row.salePrice,
      isActive: true,
      rawJson: row.rawJson,
      lastImportRunId: result.run.id,
    });
  });

  it('replaces the snapshot, inactivates absent Masters, and preserves recipe references', async () => {
    await importSnapshot(
      [
        makeRow(0, { sellpiaProductCode: 'SP-KEEP', currentStock: 2 }),
        makeRow(1, { sellpiaProductCode: 'SP-ABSENT', currentStock: 8 }),
        makeRow(2, { sellpiaProductCode: 'SP-ALSO-ABSENT', currentStock: 3 }),
      ],
      fileHash('snapshot-one'),
    );
    const absentBefore = await prisma.masterProduct.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-ABSENT',
      },
    });
    const component = await createComponentReference(absentBefore.id);
    const otherOrganizationMaster = await prisma.masterProduct.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'SP-KEEP',
        name: '다른 조직',
        currentStock: 777,
      },
    });

    const result = await importSnapshot(
      [
        makeRow(0, {
          sellpiaProductCode: 'SP-KEEP',
          name: '변경된 이름',
          optionName: '변경된 옵션',
          barcode: '000011112222',
          currentStock: 22,
          purchasePrice: 1_200,
          salePrice: 2_300,
          rawJson: { source: 'second snapshot' },
        }),
        makeRow(1, { sellpiaProductCode: 'SP-CREATED', currentStock: 4 }),
      ],
      fileHash('snapshot-two'),
    );

    const [keep, absentAfter, componentAfter, otherAfter] = await Promise.all([
      prisma.masterProduct.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-KEEP' },
      }),
      prisma.masterProduct.findUniqueOrThrow({
        where: { id: absentBefore.id },
      }),
      prisma.channelSkuComponent.findUniqueOrThrow({
        where: { id: component.id },
      }),
      prisma.masterProduct.findUniqueOrThrow({
        where: { id: otherOrganizationMaster.id },
      }),
    ]);

    expect(keep).toMatchObject({
      name: '변경된 이름',
      optionName: '변경된 옵션',
      barcode: '000011112222',
      currentStock: 22,
      purchasePrice: 1_200,
      salePrice: 2_300,
      rawJson: { source: 'second snapshot' },
      lastImportRunId: result.run.id,
      isActive: true,
    });
    expect(absentAfter).toMatchObject({
      id: absentBefore.id,
      currentStock: 0,
      isActive: false,
      lastImportRunId: result.run.id,
    });
    expect(componentAfter).toMatchObject({
      id: component.id,
      masterProductId: absentBefore.id,
    });
    expect(otherAfter).toMatchObject({ currentStock: 777, isActive: true });
    expect(result.changes).toEqual({
      createdMasterProductCount: 1,
      updatedMasterProductCount: 1,
      inactivatedMasterProductCount: 2,
    });
  });

  it('reactivates a reappearing code with the same MasterProduct identity', async () => {
    await importSnapshot(
      [makeRow(0, { sellpiaProductCode: 'SP-RETURN', currentStock: 5 })],
      fileHash('reappearance-first'),
    );
    const before = await prisma.masterProduct.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-RETURN' },
    });

    await importSnapshot(
      [makeRow(1, { sellpiaProductCode: 'SP-OTHER', currentStock: 8 })],
      fileHash('reappearance-absent'),
    );
    await importSnapshot(
      [
        makeRow(2, {
          sellpiaProductCode: 'SP-RETURN',
          name: '다시 들어온 상품',
          currentStock: 13,
        }),
      ],
      fileHash('reappearance-returned'),
    );

    const [after, runs] = await Promise.all([
      prisma.masterProduct.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-RETURN' },
      }),
      prisma.sourceImportRun.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceType: 'sellpia_inventory',
          status: 'completed',
        },
        orderBy: { publicationSequence: 'asc' },
        select: { publicationSequence: true },
      }),
    ]);

    expect(after).toMatchObject({
      id: before.id,
      name: '다시 들어온 상품',
      currentStock: 13,
      isActive: true,
    });
    expect(runs.map((run) => run.publicationSequence)).toEqual([1n, 2n, 3n]);
  });

  it('returns a completed same-hash import as an idempotent duplicate', async () => {
    const hash = fileHash('same-hash');
    const first = await importSnapshot([makeRow(0)], hash);
    const before = await prisma.masterProduct.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });

    const duplicate = await importSnapshot(
      [makeRow(0, { name: 'must not be written', currentStock: 999 })],
      hash,
    );
    const after = await prisma.masterProduct.findUniqueOrThrow({
      where: { id: before.id },
    });

    expect(duplicate).toMatchObject({
      duplicate: true,
      changes: {
        createdMasterProductCount: 0,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
    });
    expect(duplicate.run.id).toBe(first.run.id);
    expect(after).toEqual(before);
    expect(await prisma.sourceImportRun.count()).toBe(1);
  });

  it('scopes identical file hashes and Master codes independently by organization', async () => {
    const hash = fileHash('cross-org');
    const testResult = await importSnapshot([makeRow(0)], hash);
    const otherResult = await service.importInventory({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      fileName: 'sellpia.xls',
      fileHash: hash,
      headers: ['상품코드', '재고'],
      rows: [makeRow(0, { currentStock: 55 })],
    });

    expect(testResult.duplicate).toBe(false);
    expect(otherResult.duplicate).toBe(false);
    expect(otherResult.run.id).not.toBe(testResult.run.id);
    expect(await prisma.sourceImportRun.count()).toBe(2);
    expect(await prisma.masterProduct.count()).toBe(2);
  });

  it('serializes concurrent publications within the organization/source lane', async () => {
    await Promise.all([
      importSnapshot(
        [makeRow(0, { sellpiaProductCode: 'SP-CONCURRENT-A' })],
        fileHash('concurrent-a'),
      ),
      importSnapshot(
        [makeRow(1, { sellpiaProductCode: 'SP-CONCURRENT-B' })],
        fileHash('concurrent-b'),
      ),
    ]);

    const [runs, activeCount] = await Promise.all([
      prisma.sourceImportRun.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceType: 'sellpia_inventory',
          status: 'completed',
        },
        orderBy: { publicationSequence: 'asc' },
        select: { publicationSequence: true },
      }),
      prisma.masterProduct.count({
        where: { organizationId: TEST_ORGANIZATION_ID, isActive: true },
      }),
    ]);

    expect(runs.map((run) => run.publicationSequence)).toEqual([1n, 2n]);
    expect(activeCount).toBe(1);
  });

  it('keeps a recent run running and compare-and-set reclaims one stale worker', async () => {
    const hash = fileHash('stale-running');
    const oldToken = randomUUID();
    const run = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'sellpia.xls',
        fileHash: hash,
        status: 'running',
        rowCount: 1,
        createdBy: TEST_USER_ID,
        attemptToken: oldToken,
        updatedAt: new Date(Date.now() - 29 * 60 * 1_000),
      },
    });

    expect(await claim(hash)).toEqual({ kind: 'running' });
    await prisma.sourceImportRun.update({
      where: { id: run.id },
      data: { updatedAt: new Date(Date.now() - 31 * 60 * 1_000) },
    });

    const claims = await Promise.all([claim(hash), claim(hash)]);
    expect(claims.map((value) => value.kind).sort()).toEqual([
      'running',
      'started',
    ]);
    const started = claims.find((value) => value.kind === 'started');
    expect(started).toMatchObject({ kind: 'started', runId: run.id });
    if (started?.kind !== 'started') throw new Error('Expected reclaimed run');
    expect(started.attemptToken).not.toBe(oldToken);
  });

  it('compare-and-set retries a failed run with the same ID and a rotated fence token', async () => {
    const hash = fileHash('failed-retry');
    const oldToken = randomUUID();
    const run = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'sellpia.xls',
        fileHash: hash,
        status: 'failed',
        rowCount: 1,
        createdBy: TEST_USER_ID,
        attemptToken: oldToken,
      },
    });

    const retried = await claim(hash);

    expect(retried).toMatchObject({ kind: 'started', runId: run.id });
    if (retried.kind !== 'started') throw new Error('Expected retried run');
    expect(retried.attemptToken).not.toBe(oldToken);
    expect(await claim(hash)).toEqual({ kind: 'running' });
  });

  it('prevents a stale worker from publishing or failing a reclaimed run', async () => {
    const hash = fileHash('fenced-worker');
    const staleToken = randomUUID();
    const run = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'sellpia.xls',
        fileHash: hash,
        status: 'running',
        rowCount: 1,
        createdBy: TEST_USER_ID,
        attemptToken: staleToken,
        updatedAt: new Date(Date.now() - 31 * 60 * 1_000),
      },
    });
    const currentWorker = await claim(hash);
    if (currentWorker.kind !== 'started') {
      throw new Error('Expected current worker to reclaim the run');
    }

    await expect(
      repository.replaceSellpiaSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        runId: run.id,
        attemptToken: staleToken,
        rows: [makeRow(0, { sellpiaProductCode: 'SP-STALE' })],
      }),
    ).rejects.toThrow();
    await repository.markImportFailed(
      TEST_ORGANIZATION_ID,
      run.id,
      staleToken,
    );
    expect(await prisma.masterProduct.count()).toBe(0);

    const currentResult = await repository.replaceSellpiaSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      attemptToken: currentWorker.attemptToken,
      rows: [
        makeRow(0, {
          sellpiaProductCode: 'SP-CURRENT',
          currentStock: 12,
        }),
      ],
    });
    const lateResult = await repository.replaceSellpiaSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      attemptToken: staleToken,
      rows: [makeRow(0, { sellpiaProductCode: 'SP-STALE' })],
    });

    expect(currentResult.duplicate).toBe(false);
    expect(lateResult.duplicate).toBe(true);
    expect(
      await prisma.masterProduct.findMany({
        select: { code: true, currentStock: true },
      }),
    ).toEqual([{ code: 'SP-CURRENT', currentStock: 12 }]);
    expect(
      await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({
      status: 'completed',
      attemptToken: currentWorker.attemptToken,
    });
  });

  it('rolls back partial MasterProduct upserts and marks the run failed', async () => {
    const original = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-00000',
        name: 'before failure',
        currentStock: 9,
      },
    });
    const rows = makeRows(501);
    rows[500] = makeRow(500, {
      rawJson: { cannotSerialize: BigInt(1) },
    });
    const hash = fileHash('rollback-after-first-batch');

    await expect(importSnapshot(rows, hash)).rejects.toThrow();

    expect(
      await prisma.masterProduct.findUniqueOrThrow({ where: { id: original.id } }),
    ).toMatchObject({
      code: 'SP-00000',
      name: 'before failure',
      currentStock: 9,
      isActive: true,
    });
    expect(await prisma.masterProduct.count()).toBe(1);
    expect(
      await prisma.sourceImportRun.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, fileHash: hash },
      }),
    ).toMatchObject({ status: 'failed' });
  });

  async function importSnapshot(
    rows: ParsedSellpiaInventoryRow[],
    hash: string,
  ) {
    return service.importInventory({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      fileName: 'sellpia.xls',
      fileHash: hash,
      headers: ['상품코드', '상품명', '재고'],
      rows,
    });
  }

  function claim(hash: string) {
    return repository.claimSellpiaImport({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      fileName: 'sellpia.xls',
      fileHash: hash,
      rowCount: 1,
    });
  }

  async function createComponentReference(masterProductId: string) {
    const channelAccount = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Sellpia reference account',
        externalAccountId: `sellpia-reference-${randomUUID()}`,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: channelAccount.id,
        externalId: `listing-${randomUUID()}`,
      },
    });
    const channelSku = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: `option-${randomUUID()}`,
      },
    });
    return prisma.channelSkuComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelSkuId: channelSku.id,
        masterProductId,
        quantity: 1,
        mappingSource: 'manual',
      },
    });
  }
});

function makeRows(count: number): ParsedSellpiaInventoryRow[] {
  return Array.from({ length: count }, (_, index) => makeRow(index));
}

function makeRow(
  index: number,
  overrides: Partial<ParsedSellpiaInventoryRow> = {},
): ParsedSellpiaInventoryRow {
  return {
    rowNumber: index + 2,
    sellpiaProductCode: `SP-${String(index).padStart(5, '0')}`,
    name: `상품 ${index}`,
    optionName: index % 2 === 0 ? null : `옵션 ${index}`,
    barcode: `880${String(index).padStart(10, '0')}`,
    currentStock: index % 100,
    purchasePrice: index * 10,
    salePrice: index * 20,
    rawJson: { index },
    ...overrides,
  };
}

function fileHash(label: string): string {
  return createHash('sha256').update(label).digest('hex');
}
