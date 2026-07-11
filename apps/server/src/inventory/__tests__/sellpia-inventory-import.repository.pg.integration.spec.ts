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
    repository = new InventorySkuImportRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    service = new SellpiaInventoryImportService(repository);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('imports 1,964 Sellpia codes as distinct InventorySku rows despite duplicate names/barcodes', async () => {
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
    const [count, duplicateMetadataRows] = await Promise.all([
      prisma.inventorySku.count({ where: { organizationId: TEST_ORGANIZATION_ID } }),
      prisma.inventorySku.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellpiaProductCode: { in: ['SP-DUP-A', 'SP-DUP-B'] },
        },
        orderBy: { sellpiaProductCode: 'asc' },
      }),
    ]);

    expect(count).toBe(REPRESENTATIVE_ROW_COUNT);
    expect(duplicateMetadataRows).toHaveLength(2);
    expect(new Set(duplicateMetadataRows.map((row) => row.id))).toHaveLength(2);
    expect(result.changes).toEqual({
      createdSkuCount: REPRESENTATIVE_ROW_COUNT,
      updatedSkuCount: 0,
      zeroedSkuCount: 0,
    });
  });

  it('atomically replaces metadata, zeroes absent codes, preserves IDs/references, and never mutates legacy stock surfaces', async () => {
    const first = await importSnapshot([
      makeRow(0, { sellpiaProductCode: 'SP-KEEP', reportedStock: 2 }),
      makeRow(1, { sellpiaProductCode: 'SP-ABSENT', reportedStock: 8 }),
      makeRow(2, { sellpiaProductCode: 'SP-ALSO-ABSENT', reportedStock: 3 }),
    ], fileHash('snapshot-one'));
    expect(first.duplicate).toBe(false);

    const absentBefore = await prisma.inventorySku.findFirstOrThrow({
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
        reportedStock: 777,
      },
    });
    const legacyBefore = await seedLegacyStockSentinels();

    const secondRows = [
      makeRow(0, {
        sellpiaProductCode: 'SP-KEEP',
        name: '변경된 이름',
        optionName: '변경된 옵션',
        barcode: '000011112222',
        reportedStock: 22,
        purchasePrice: 1_200,
        salePrice: 2_300,
        rawJson: { source: 'second snapshot' },
      }),
      makeRow(1, { sellpiaProductCode: 'SP-CREATED', reportedStock: 4 }),
    ];
    const result = await importSnapshot(secondRows, fileHash('snapshot-two'));

    const [keep, absentAfter, componentAfter, otherOrganization, legacyAfter] = await Promise.all([
      prisma.inventorySku.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, sellpiaProductCode: 'SP-KEEP' },
      }),
      prisma.inventorySku.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, sellpiaProductCode: 'SP-ABSENT' },
      }),
      prisma.channelSkuComponent.findUnique({ where: { id: component.id } }),
      prisma.inventorySku.findFirstOrThrow({
        where: { organizationId: OTHER_ORGANIZATION_ID, sellpiaProductCode: 'SP-KEEP' },
      }),
      legacyStockState(),
    ]);

    expect(keep).toMatchObject({
      name: '변경된 이름',
      optionName: '변경된 옵션',
      barcode: '000011112222',
      reportedStock: 22,
      purchasePrice: 1_200,
      salePrice: 2_300,
      rawJson: { source: 'second snapshot' },
      lastImportRunId: result.run.id,
    });
    expect(absentAfter).toMatchObject({
      id: absentBefore.id,
      reportedStock: 0,
      lastImportRunId: result.run.id,
    });
    expect(componentAfter).toMatchObject({
      id: component.id,
      inventorySkuId: absentBefore.id,
    });
    expect(otherOrganization.reportedStock).toBe(777);
    expect(result.changes).toEqual({
      createdSkuCount: 1,
      updatedSkuCount: 1,
      zeroedSkuCount: 2,
    });
    expect(legacyAfter).toEqual(legacyBefore);
  });

  it('returns a completed same-hash import as a duplicate with zero writes', async () => {
    const hash = fileHash('same-hash');
    const first = await importSnapshot([makeRow(0)], hash);
    const before = await prisma.inventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });

    const duplicate = await importSnapshot([
      makeRow(0, { name: 'must not be written', reportedStock: 999 }),
    ], hash);
    const after = await prisma.inventorySku.findFirstOrThrow({ where: { id: before.id } });

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
      rows: [makeRow(0, { reportedStock: 55 })],
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

    const claims = await Promise.all([
      claim(hash),
      claim(hash),
    ]);
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

    await expect(repository.replaceSellpiaSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      attemptToken: workerAToken,
      rows: [makeRow(0, { sellpiaProductCode: 'SP-WORKER-A' })],
    })).rejects.toThrow();
    await repository.markImportFailed(TEST_ORGANIZATION_ID, run.id, workerAToken);
    expect(await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: run.id } }))
      .toMatchObject({ status: 'running', attemptToken: workerB.attemptToken });
    expect(await prisma.inventorySku.count()).toBe(0);

    const workerBResult = await repository.replaceSellpiaSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      attemptToken: workerB.attemptToken,
      rows: [makeRow(0, { sellpiaProductCode: 'SP-WORKER-B', reportedStock: 12 })],
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
    expect(await prisma.inventorySku.findMany({
      select: { sellpiaProductCode: true, reportedStock: true },
    })).toEqual([{ sellpiaProductCode: 'SP-WORKER-B', reportedStock: 12 }]);
    expect(await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: run.id } }))
      .toMatchObject({ status: 'completed', attemptToken: workerB.attemptToken });
  });

  it('rolls back the first upsert batch and marks the fenced run failed after service handling', async () => {
    await prisma.inventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: 'SP-00000',
        name: 'before failure',
        reportedStock: 9,
      },
    });
    const rows = makeRows(501);
    rows[500] = makeRow(500, {
      rawJson: { cannotSerialize: BigInt(1) },
    });
    const hash = fileHash('rollback-after-first-batch');

    await expect(importSnapshot(rows, hash)).rejects.toThrow();

    expect(await prisma.inventorySku.findMany({
      select: { sellpiaProductCode: true, name: true, reportedStock: true },
    })).toEqual([
      {
        sellpiaProductCode: 'SP-00000',
        name: 'before failure',
        reportedStock: 9,
      },
    ]);
    expect(await prisma.sourceImportRun.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, fileHash: hash },
    })).toMatchObject({ status: 'failed' });
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

  async function seedLegacyStockSentinels() {
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: `M-${randomUUID()}`,
        name: 'legacy sentinel',
      },
    });
    const option = await prisma.productOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterId: master.id,
        sku: `SKU-${randomUUID()}`,
        optionName: 'legacy option',
      },
    });
    const inventory = await prisma.inventory.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        optionId: option.id,
        currentStock: 10,
      },
    });
    await prisma.stockTransaction.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        optionId: option.id,
        type: 'ADJUST',
        quantity: 1,
      },
    });
    await prisma.rocketInventoryLedger.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        inventoryId: inventory.id,
        optionId: option.id,
        eventType: 'sentinel',
        quantity: 1,
        stockDelta: 1,
        sourceActionId: randomUUID(),
        sourceType: 'test',
        sourceRef: 'sentinel',
      },
    });
    return legacyStockState();
  }

  async function legacyStockState() {
    const [productOptions, inventory, stockTransactions, rocketLedger] = await Promise.all([
      prisma.productOption.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        select: { id: true, availableStock: true },
        orderBy: { id: 'asc' },
      }),
      prisma.inventory.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        select: { id: true, currentStock: true, reservedStock: true },
        orderBy: { id: 'asc' },
      }),
      prisma.stockTransaction.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        select: { id: true, quantity: true },
        orderBy: { id: 'asc' },
      }),
      prisma.rocketInventoryLedger.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        select: { id: true, quantity: true, stockDelta: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { productOptions, inventory, stockTransactions, rocketLedger };
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
    reportedStock: index % 100,
    purchasePrice: index * 10,
    salePrice: index * 20,
    rawJson: { index },
    ...overrides,
  };
}

function fileHash(label: string): string {
  return createHash('sha256').update(label).digest('hex');
}
