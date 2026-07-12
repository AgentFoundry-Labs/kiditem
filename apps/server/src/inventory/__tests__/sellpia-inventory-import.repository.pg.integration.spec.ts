import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InventorySkuImportRepositoryAdapter } from '../adapter/out/repository/inventory-sku-import.repository.adapter';
import { SellpiaInventoryImportService } from '../application/service/sellpia-inventory-import.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { ParsedSellpiaInventoryRow } from '../application/service/sellpia-inventory-workbook.parser';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

const REPRESENTATIVE_ROW_COUNT = 1_964;

describe('InventorySkuImportRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: InventorySkuImportRepositoryAdapter;
  let service: SellpiaInventoryImportService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new InventorySkuImportRepositoryAdapter(prisma as unknown as PrismaService);
    service = new SellpiaInventoryImportService(repository);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('publishes 1,964 Sellpia codes to legacy SKUs, staged Masters, and the identity ledger', async () => {
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
    const [count, masterCount, ledgerCount, duplicateMetadataRows, run] = await Promise.all([
      prisma.inventorySku.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.masterProduct.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellpiaProductCode: { not: null },
        },
      }),
      prisma.inventorySkuMasterProductMap.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.inventorySku.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellpiaProductCode: { in: ['SP-DUP-A', 'SP-DUP-B'] },
        },
        orderBy: { sellpiaProductCode: 'asc' },
      }),
      prisma.sourceImportRun.findUniqueOrThrow({
        where: { id: result.run.id },
      }),
    ]);

    expect(count).toBe(REPRESENTATIVE_ROW_COUNT);
    expect(masterCount).toBe(REPRESENTATIVE_ROW_COUNT);
    expect(ledgerCount).toBe(REPRESENTATIVE_ROW_COUNT);
    expect(duplicateMetadataRows).toHaveLength(2);
    expect(new Set(duplicateMetadataRows.map((row) => row.id))).toHaveLength(2);
    expect(result.changes).toEqual({
      createdSkuCount: REPRESENTATIVE_ROW_COUNT,
      updatedSkuCount: 0,
      zeroedSkuCount: 0,
    });
    expect(run.publicationSequence).toBe(1n);
  });

  it('writes identical source fields to the legacy SKU and deterministic staged Master', async () => {
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
    const inventorySku = await prisma.inventorySku.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: row.sellpiaProductCode,
      },
    });
    const masterProduct = await prisma.masterProduct.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: row.sellpiaProductCode,
      },
    });
    const identity = await prisma.inventorySkuMasterProductMap.findUniqueOrThrow({
      where: { inventorySkuId: inventorySku.id },
    });

    expect(inventorySku).toMatchObject({
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
    expect(masterProduct).toMatchObject({
      code: stagedMasterCode(row.sellpiaProductCode),
      name: row.name,
      sellpiaProductCode: row.sellpiaProductCode,
      sellpiaName: row.name,
      sellpiaBarcode: row.barcode,
      optionName: row.optionName,
      currentStock: row.currentStock,
      purchasePrice: row.purchasePrice,
      salePrice: row.salePrice,
      isActive: true,
      rawJson: row.rawJson,
      lastImportRunId: result.run.id,
      isTemporary: true,
      temporaryReason: 'sellpia_master_cutover',
      lifecycleState: 'inventory_staged',
    });
    expect(identity).toMatchObject({
      organizationId: TEST_ORGANIZATION_ID,
      inventorySkuId: inventorySku.id,
      masterProductId: masterProduct.id,
    });
  });

  it('atomically replaces metadata, zeroes absent codes, and preserves IDs/references', async () => {
    const first = await importSnapshot(
      [
      makeRow(0, { sellpiaProductCode: 'SP-KEEP', currentStock: 2 }),
      makeRow(1, { sellpiaProductCode: 'SP-ABSENT', currentStock: 8 }),
      makeRow(2, { sellpiaProductCode: 'SP-ALSO-ABSENT', currentStock: 3 }),
      ],
      fileHash('snapshot-one'),
    );
    expect(first.duplicate).toBe(false);

    const absentBefore = await prisma.inventorySku.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: 'SP-ABSENT',
      },
    });
    const absentMasterBefore = await prisma.masterProduct.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: 'SP-ABSENT',
      },
    });
    const component = await createComponentReference(absentBefore.id);
    await prisma.inventorySku.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        sellpiaProductCode: 'SP-KEEP',
        name: '다른 조직',
        currentStock: 777,
      },
    });
    const secondRows = [
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
    ];
    const result = await importSnapshot(secondRows, fileHash('snapshot-two'));

    const [keep, keepMaster, absentAfter, absentMasterAfter, componentAfter, otherOrganization] =
      await Promise.all([
      prisma.inventorySku.findFirstOrThrow({
          where: {
            organizationId: TEST_ORGANIZATION_ID,
            sellpiaProductCode: 'SP-KEEP',
          },
        }),
        prisma.masterProduct.findFirstOrThrow({
          where: {
            organizationId: TEST_ORGANIZATION_ID,
            sellpiaProductCode: 'SP-KEEP',
          },
      }),
      prisma.inventorySku.findFirstOrThrow({
          where: {
            organizationId: TEST_ORGANIZATION_ID,
            sellpiaProductCode: 'SP-ABSENT',
          },
        }),
        prisma.masterProduct.findFirstOrThrow({
          where: {
            organizationId: TEST_ORGANIZATION_ID,
            sellpiaProductCode: 'SP-ABSENT',
          },
      }),
      prisma.channelSkuComponent.findUnique({ where: { id: component.id } }),
      prisma.inventorySku.findFirstOrThrow({
          where: {
            organizationId: OTHER_ORGANIZATION_ID,
            sellpiaProductCode: 'SP-KEEP',
          },
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
    expect(keepMaster).toMatchObject({
      sellpiaName: '변경된 이름',
      optionName: '변경된 옵션',
      sellpiaBarcode: '000011112222',
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
    expect(absentMasterAfter).toMatchObject({
      id: absentMasterBefore.id,
      currentStock: 0,
      isActive: false,
      lastImportRunId: result.run.id,
    });
    expect(componentAfter).toMatchObject({
      id: component.id,
      inventorySkuId: absentBefore.id,
    });
    expect(otherOrganization.currentStock).toBe(777);
    expect(result.changes).toEqual({
      createdSkuCount: 1,
      updatedSkuCount: 1,
      zeroedSkuCount: 2,
    });
  });

  it('reactivates a reappearing Sellpia code with the same SKU, Master, and ledger identities', async () => {
    await importSnapshot(
      [makeRow(0, { sellpiaProductCode: 'SP-RETURN', currentStock: 5 })],
      fileHash('reappearance-first'),
    );
    const inventoryBefore = await prisma.inventorySku.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: 'SP-RETURN',
      },
    });
    const masterBefore = await prisma.masterProduct.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: 'SP-RETURN',
      },
    });
    const identityBefore = await prisma.inventorySkuMasterProductMap.findUniqueOrThrow({
      where: { inventorySkuId: inventoryBefore.id },
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

    const [inventoryAfter, masterAfter, identityAfter, runs] = await Promise.all([
      prisma.inventorySku.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellpiaProductCode: 'SP-RETURN',
        },
      }),
      prisma.masterProduct.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellpiaProductCode: 'SP-RETURN',
        },
      }),
      prisma.inventorySkuMasterProductMap.findUniqueOrThrow({
        where: { inventorySkuId: inventoryBefore.id },
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

    expect(inventoryAfter).toMatchObject({
      id: inventoryBefore.id,
      name: '다시 들어온 상품',
      currentStock: 13,
      isActive: true,
    });
    expect(masterAfter).toMatchObject({
      id: masterBefore.id,
      sellpiaName: '다시 들어온 상품',
      currentStock: 13,
      isActive: true,
    });
    expect(identityAfter).toEqual(identityBefore);
    expect(runs.map((run) => run.publicationSequence)).toEqual([1n, 2n, 3n]);
  });

  it('serializes concurrent completed publications within the organization/source lane', async () => {
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
      prisma.inventorySku.count({
        where: { organizationId: TEST_ORGANIZATION_ID, isActive: true },
      }),
    ]);

    expect(runs.map((run) => run.publicationSequence)).toEqual([1n, 2n]);
    expect(activeCount).toBe(1);
  });

  it('returns a completed same-hash import as a duplicate with zero writes', async () => {
    const hash = fileHash('same-hash');
    const first = await importSnapshot([makeRow(0)], hash);
    const before = await prisma.inventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });

    const duplicate = await importSnapshot(
      [makeRow(0, { name: 'must not be written', currentStock: 999 })],
      hash,
    );
    const after = await prisma.inventorySku.findFirstOrThrow({
      where: { id: before.id },
    });

    expect(duplicate).toMatchObject({
      duplicate: true,
      changes: { createdSkuCount: 0, updatedSkuCount: 0, zeroedSkuCount: 0 },
    });
    expect(duplicate.run.id).toBe(first.run.id);
    expect(after).toEqual(before);
    expect(await prisma.sourceImportRun.count()).toBe(1);
  });

  it('scopes identical hashes independently to each organization', async () => {
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
    expect(await prisma.inventorySku.count()).toBe(2);
  });

  it('keeps a recent run running and compare-and-set reclaims one stale worker only', async () => {
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

    await expectClaimKind(hash, 'running');
    await prisma.sourceImportRun.update({
      where: { id: run.id },
      data: { updatedAt: new Date(Date.now() - 31 * 60 * 1_000) },
    });

    const claims = await Promise.all([claim(hash), claim(hash)]);
    expect(claims.map((value) => value.kind).sort()).toEqual(['running', 'started']);
    const started = claims.find((value) => value.kind === 'started');
    expect(started).toMatchObject({ kind: 'started', runId: run.id });
    if (started?.kind !== 'started') throw new Error('Expected a reclaimed claim');
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
    if (retried.kind !== 'started') throw new Error('Expected a retried claim');
    expect(retried.attemptToken).not.toBe(oldToken);
    await expectClaimKind(hash, 'running');
  });

  it('prevents a stale worker from writing, completing, or failing a reclaimed run', async () => {
    const hash = fileHash('fenced-worker');
    const workerAToken = randomUUID();
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
        attemptToken: workerAToken,
        updatedAt: new Date(Date.now() - 31 * 60 * 1_000),
      },
    });
    const workerB = await claim(hash);
    if (workerB.kind !== 'started') throw new Error('Expected worker B to reclaim the run');

    await expect(
      repository.replaceSellpiaSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      attemptToken: workerAToken,
      rows: [makeRow(0, { sellpiaProductCode: 'SP-WORKER-A' })],
      }),
    ).rejects.toThrow();
    await repository.markImportFailed(TEST_ORGANIZATION_ID, run.id, workerAToken);
    expect(await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject(
      { status: 'running', attemptToken: workerB.attemptToken },
    );
    expect(await prisma.inventorySku.count()).toBe(0);
    expect(
      await prisma.masterProduct.count({
        where: { sellpiaProductCode: { not: null } },
      }),
    ).toBe(0);
    expect(await prisma.inventorySkuMasterProductMap.count()).toBe(0);

    const workerBResult = await repository.replaceSellpiaSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      attemptToken: workerB.attemptToken,
      rows: [makeRow(0, { sellpiaProductCode: 'SP-WORKER-B', currentStock: 12 })],
    });
    const lateWorkerAResult = await repository.replaceSellpiaSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      attemptToken: workerAToken,
      rows: [makeRow(0, { sellpiaProductCode: 'SP-WORKER-A' })],
    });
    await repository.markImportFailed(TEST_ORGANIZATION_ID, run.id, workerAToken);

    expect(workerBResult.duplicate).toBe(false);
    expect(lateWorkerAResult.duplicate).toBe(true);
    expect(
      await prisma.inventorySku.findMany({
        select: { sellpiaProductCode: true, currentStock: true },
      }),
    ).toEqual([{ sellpiaProductCode: 'SP-WORKER-B', currentStock: 12 }]);
    expect(
      await prisma.masterProduct.findMany({
        where: { sellpiaProductCode: { not: null } },
      select: { sellpiaProductCode: true, currentStock: true },
      }),
    ).toEqual([{ sellpiaProductCode: 'SP-WORKER-B', currentStock: 12 }]);
    expect(await prisma.inventorySkuMasterProductMap.count()).toBe(1);
    expect(await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject(
      {
        status: 'completed',
        attemptToken: workerB.attemptToken,
      },
    );
  });

  it('rolls back the first upsert batch and marks the fenced run failed after service handling', async () => {
    await prisma.inventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: 'SP-00000',
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
      await prisma.inventorySku.findMany({
      select: { sellpiaProductCode: true, name: true, currentStock: true },
      }),
    ).toEqual([
      {
        sellpiaProductCode: 'SP-00000',
        name: 'before failure',
        currentStock: 9,
      },
    ]);
    expect(
      await prisma.sourceImportRun.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, fileHash: hash },
      }),
    ).toMatchObject({ status: 'failed' });
    expect(
      await prisma.masterProduct.count({
        where: { sellpiaProductCode: { not: null } },
      }),
    ).toBe(0);
    expect(await prisma.inventorySkuMasterProductMap.count()).toBe(0);
  });

  async function importSnapshot(rows: ParsedSellpiaInventoryRow[], hash: string) {
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

  async function expectClaimKind(hash: string, kind: 'running'): Promise<void> {
    expect(await claim(hash)).toEqual({ kind });
  }

  async function createComponentReference(inventorySkuId: string) {
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
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
        inventorySkuId,
        quantity: 1,
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

function stagedMasterCode(sellpiaProductCode: string): string {
  const digest = createHash('sha256').update(sellpiaProductCode).digest('hex').slice(0, 24);
  return `SELLPIA::${TEST_ORGANIZATION_ID}::${digest}`;
}
