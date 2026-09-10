import * as XLSX from 'xlsx';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { InventorySkuSnapshotListRepositoryAdapter } from '../adapter/out/repository/inventory-sku-snapshot-list.repository.adapter';
import { InventorySkuSnapshotListService } from '../application/service/inventory-sku-snapshot-list.service';
import { InventorySkuExportService } from '../application/service/inventory-sku-export.service';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

describe('InventorySkuExportService (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('exports one repeatable-read snapshot while a concurrent mutation commits', async () => {
    const beforeImportedAt = new Date('2026-07-12T01:00:00.000Z');
    const beforeRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'before-publication.xlsx',
        fileHash: 'b'.repeat(64),
        status: 'completed',
        rowCount: 201,
        importedAt: beforeImportedAt,
        lastVerifiedAt: beforeImportedAt,
        verificationCount: 1,
        freshnessGeneration: 1n,
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        lastCompletedImportRunId: beforeRun.id,
        lastVerifiedAt: beforeImportedAt,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
      },
    });
    await prisma.sellpiaInventorySku.createMany({
      data: Array.from({ length: 201 }, (_, index) => ({
        organizationId: TEST_ORGANIZATION_ID,
        code: `EXPORT-${String(index).padStart(3, '0')}`,
        name: 'before-publication',
        currentStock: 1,
        isActive: true,
        lastImportRunId: beforeRun.id,
      })),
    });

    let releaseRead!: () => void;
    const readPaused = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let rowsRead!: () => void;
    const rowsReady = new Promise<void>((resolve) => {
      rowsRead = resolve;
    });
    let paused = false;
    const reader = prisma.$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (!paused && model === 'SellpiaInventorySku' && operation === 'findMany') {
            paused = true;
            rowsRead();
            await readPaused;
          }
          return result;
        },
      },
    });
    const snapshots = new InventorySkuSnapshotListService(
      new InventorySkuSnapshotListRepositoryAdapter(reader as unknown as PrismaService),
    );
    const exporter = new InventorySkuExportService(snapshots);

    const exportPromise = exporter.export(TEST_ORGANIZATION_ID, {
      stockStatus: 'all',
      activeStatus: 'active',
    });
    await rowsReady;

    const afterImportedAt = new Date('2026-07-12T02:00:00.000Z');
    const afterRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'after-publication.xlsx',
        fileHash: 'a'.repeat(64),
        status: 'completed',
        rowCount: 201,
        importedAt: afterImportedAt,
        lastVerifiedAt: afterImportedAt,
        verificationCount: 1,
        freshnessGeneration: 2n,
      },
    });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.sellpiaInventorySku.updateMany({
          where: { organizationId: TEST_ORGANIZATION_ID },
          data: {
            name: 'after-publication',
            currentStock: 9,
            lastImportRunId: afterRun.id,
          },
        });
        await tx.sellpiaInventoryState.update({
          where: { organizationId: TEST_ORGANIZATION_ID },
          data: {
            lastCompletedImportRunId: afterRun.id,
            lastVerifiedAt: afterImportedAt,
            requestedGeneration: 2n,
            verifiedGeneration: 2n,
          },
        });
      });
    } finally {
      releaseRead();
    }

    const result = await exportPromise;
    const workbook = XLSX.read(result.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets['Sellpia 현재재고'],
      { defval: '' },
    );

    expect(result.rowCount).toBe(201);
    expect(rows).toHaveLength(201);
    expect(new Set(rows.map((row) => row.상품명))).toEqual(new Set(['before-publication']));
    expect(new Set(rows.map((row) => row.현재고))).toEqual(new Set([1]));
    expect(new Set(rows.map((row) => row.최종가져오기))).toEqual(
      new Set([beforeImportedAt.toISOString()]),
    );
    expect(new Set(rows.map((row) => row.셀피아상품코드)).size).toBe(201);

    const current = await snapshots.listSnapshotForExport(TEST_ORGANIZATION_ID, {
      stockStatus: 'all',
      activeStatus: 'active',
    });
    expect(current.latestImport).toMatchObject({
      id: afterRun.id,
      importedAt: afterImportedAt.toISOString(),
    });
    expect(new Set(current.items.map((item) => item.name))).toEqual(
      new Set(['after-publication']),
    );
    expect(new Set(current.items.map((item) => item.currentStock))).toEqual(new Set([9]));
    expect(new Set(current.items.map((item) => item.lastImportedAt))).toEqual(
      new Set([afterImportedAt.toISOString()]),
    );
  });
});
