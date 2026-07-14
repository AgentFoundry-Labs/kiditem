import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { InventorySkuSnapshotListRepositoryAdapter } from '../adapter/out/repository/inventory-sku-snapshot-list.repository.adapter';
import { InventorySkuSnapshotListService } from '../application/service/inventory-sku-snapshot-list.service';

describe('InventorySkuSnapshotListRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let service: InventorySkuSnapshotListService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new InventorySkuSnapshotListService(
      new InventorySkuSnapshotListRepositoryAdapter(prisma as unknown as PrismaService),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('tenant-scopes search/filter/page rows while returning organization-wide summary', async () => {
    const run = await createRun({
      organizationId: TEST_ORGANIZATION_ID,
      fileName: 'latest.xls',
      fileHash: 'a'.repeat(64),
      status: 'completed',
      rowCount: 3,
      importedAt: new Date('2026-07-12T02:00:00.000Z'),
      createdAt: new Date('2026-07-12T02:00:00.000Z'),
    });
    const crossTenantRun = await createRun({
      organizationId: OTHER_ORGANIZATION_ID,
      fileName: 'other-run.xls',
      fileHash: 'f'.repeat(64),
      status: 'completed',
      rowCount: 1,
      importedAt: new Date('2026-07-12T03:00:00.000Z'),
      createdAt: new Date('2026-07-12T03:00:00.000Z'),
    });
    await expect(prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-FOREIGN-RUN',
        name: '타 조직 provenance',
        currentStock: 1,
        isActive: true,
        lastImportRunId: crossTenantRun.id,
      },
    })).rejects.toThrow();
    await prisma.masterProduct.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-002',
          name: '검색 상품',
          optionName: '파랑',
          barcode: '8800000000002',
          currentStock: 8,
          isActive: true,
          purchasePrice: 1_000,
          salePrice: 2_000,
          lastImportRunId: run.id,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-001',
          name: '품절 상품',
          currentStock: 0,
          isActive: true,
          purchasePrice: null,
          lastImportRunId: null,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'ZZ-001',
          name: '기타 상품',
          optionName: '빨강',
          currentStock: 2,
          isActive: true,
          purchasePrice: 500,
          lastImportRunId: run.id,
        },
        {
          organizationId: OTHER_ORGANIZATION_ID,
          code: 'SP-LEAK',
          name: '검색 상품 유출',
          optionName: '파랑',
          currentStock: 999,
          isActive: true,
          purchasePrice: 999,
        },
      ],
    });

    const filtered = await service.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 10,
      query: '파랑',
      stockStatus: 'in_stock',
    });

    expect(filtered.items.map(({ code }) => code)).toEqual(['SP-002']);
    expect(filtered.summary).toEqual({
      totalSkus: 3,
      inStockSkus: 2,
      outOfStockSkus: 1,
      totalUnits: 10,
      pricedAssetValue: 9_000,
      unpricedSkuCount: 1,
    });
    expect(filtered.latestImport).toMatchObject({ id: run.id, fileName: 'latest.xls' });
    expect(filtered.items[0]).toMatchObject({
      currentStock: 8,
      stockValue: 8_000,
      lastImportRunId: run.id,
      lastImportedAt: '2026-07-12T02:00:00.000Z',
    });

    const firstPage = await service.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 2,
      stockStatus: 'all',
    });
    const secondPage = await service.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 2,
      limit: 2,
      stockStatus: 'all',
    });
    expect(firstPage.items.map(({ code }) => code))
      .toEqual(['SP-001', 'SP-002']);
    expect(secondPage.items.map(({ code }) => code))
      .toEqual(['ZZ-001']);
    expect(firstPage.items[0]).toMatchObject({
      code: 'SP-001',
      lastImportRunId: null,
      lastImportedAt: null,
    });
  });

  it('returns newest-first Sellpia history and ignores channel/other-tenant runs', async () => {
    const older = await createRun({
      organizationId: TEST_ORGANIZATION_ID,
      fileName: 'older.xls',
      fileHash: 'b'.repeat(64),
      status: 'completed',
      rowCount: 1,
      importedAt: new Date('2026-07-11T00:00:00.000Z'),
      createdAt: new Date('2026-07-11T00:00:00.000Z'),
    });
    const failed = await createRun({
      organizationId: TEST_ORGANIZATION_ID,
      fileName: 'failed.xls',
      fileHash: 'c'.repeat(64),
      status: 'failed',
      rowCount: 2,
      importedAt: null,
      createdAt: new Date('2026-07-12T00:00:00.000Z'),
    });
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: null,
        fileName: 'channel.xlsx',
        fileHash: 'd'.repeat(64),
        status: 'failed',
        rowCount: 3,
        createdAt: new Date('2026-07-13T00:00:00.000Z'),
      },
    });
    await createRun({
      organizationId: OTHER_ORGANIZATION_ID,
      fileName: 'other.xls',
      fileHash: 'e'.repeat(64),
      status: 'completed',
      rowCount: 99,
      importedAt: new Date('2026-07-14T00:00:00.000Z'),
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
    });

    const history = await service.listImportRuns(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
    });

    expect(history.items.map(({ id }) => id)).toEqual([failed.id, older.id]);
    expect(history.items[0]).toMatchObject({ status: 'failed', importedAt: null });
  });

  function createRun(input: {
    organizationId: string;
    fileName: string;
    fileHash: string;
    status: string;
    rowCount: number;
    importedAt: Date | null;
    createdAt: Date;
  }) {
    return prisma.sourceImportRun.create({
      data: {
        organizationId: input.organizationId,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: input.fileName,
        fileHash: input.fileHash,
        status: input.status,
        rowCount: input.rowCount,
        importedAt: input.importedAt,
        createdAt: input.createdAt,
      },
    });
  }
});
