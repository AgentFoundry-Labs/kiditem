import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { InventorySkuSnapshotListRepositoryAdapter } from '../adapter/out/repository/inventory-sku-snapshot-list.repository.adapter';
import { InventorySkuSnapshotListService } from '../application/service/inventory-sku-snapshot-list.service';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

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
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        lastCompletedImportRunId: run.id,
      },
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
    await expect(prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-FOREIGN-RUN',
        name: '타 조직 provenance',
        currentStock: 1,
        isActive: true,
        lastImportRunId: crossTenantRun.id,
      },
    })).rejects.toThrow();
    await prisma.sellpiaInventorySku.createMany({
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

    const linkedSku = await prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-002' },
    });
    const [productA, productB] = await Promise.all([
      prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'PRODUCT-A',
          name: '운영 상품 A',
        },
      }),
      prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'PRODUCT-B',
          name: '운영 상품 B',
        },
      }),
    ]);
    const variants = await Promise.all([
      prisma.productVariant.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId: productA.id,
          code: 'VARIANT-A1',
          name: '옵션 A1',
        },
      }),
      prisma.productVariant.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId: productA.id,
          code: 'VARIANT-A2',
          name: '옵션 A2',
        },
      }),
      prisma.productVariant.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId: productB.id,
          code: 'VARIANT-B1',
          name: '옵션 B1',
        },
      }),
    ]);
    await prisma.productVariantComponent.createMany({
      data: variants.map((variant) => ({
        organizationId: TEST_ORGANIZATION_ID,
        productVariantId: variant.id,
        sellpiaInventorySkuId: linkedSku.id,
        quantity: 1,
        source: 'manual',
      })),
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
      linkedVariantCount: 3,
      linkedProductCount: 2,
      linkedProducts: [
        { id: productA.id, code: 'PRODUCT-A', name: '운영 상품 A' },
        { id: productB.id, code: 'PRODUCT-B', name: '운영 상품 B' },
      ],
      linkedVariants: [
        { id: variants[0].id, masterProductId: productA.id, code: 'VARIANT-A1', name: '옵션 A1', optionLabel: null },
        { id: variants[1].id, masterProductId: productA.id, code: 'VARIANT-A2', name: '옵션 A2', optionLabel: null },
        { id: variants[2].id, masterProductId: productB.id, code: 'VARIANT-B1', name: '옵션 B1', optionLabel: null },
      ],
      linkStatus: 'linked',
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
      linkedVariantCount: 0,
      linkedProductCount: 0,
      linkedProducts: [],
      linkedVariants: [],
      linkStatus: 'unlinked',
    });
  });

  it('does not treat another organization recipe with the same code as a link', async () => {
    await prisma.sellpiaInventorySku.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-SAME',
          name: '우리 재고',
          currentStock: 3,
        },
        {
          organizationId: OTHER_ORGANIZATION_ID,
          code: 'SP-SAME',
          name: '타 조직 재고',
          currentStock: 5,
        },
      ],
    });
    const foreignSku = await prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: OTHER_ORGANIZATION_ID, code: 'SP-SAME' },
    });
    const foreignProduct = await prisma.masterProduct.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'FOREIGN-PRODUCT',
        name: '타 조직 상품',
      },
    });
    const foreignVariant = await prisma.productVariant.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        masterProductId: foreignProduct.id,
        code: 'FOREIGN-VARIANT',
        name: '타 조직 옵션',
      },
    });
    await prisma.productVariantComponent.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        productVariantId: foreignVariant.id,
        sellpiaInventorySkuId: foreignSku.id,
        quantity: 1,
        source: 'manual',
      },
    });

    const result = await service.listSnapshot(TEST_ORGANIZATION_ID, {
      query: 'SP-SAME',
      linkStatus: 'unlinked',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        code: 'SP-SAME',
        linkedVariantCount: 0,
        linkedProductCount: 0,
        linkedProducts: [],
        linkedVariants: [],
        linkStatus: 'unlinked',
      }),
    ]);
  });

  it('uses the inventory state pointer as the current import basis instead of importedAt order', async () => {
    const current = await createRun({
      organizationId: TEST_ORGANIZATION_ID,
      fileName: 'current-basis.xls',
      fileHash: 'c'.repeat(64),
      status: 'completed',
      rowCount: 1,
      importedAt: new Date('2026-07-12T01:00:00.000Z'),
      createdAt: new Date('2026-07-12T01:00:00.000Z'),
    });
    await createRun({
      organizationId: TEST_ORGANIZATION_ID,
      fileName: 'newer-timestamp-but-not-current.xls',
      fileHash: 'd'.repeat(64),
      status: 'completed',
      rowCount: 1,
      importedAt: new Date('2026-07-12T02:00:00.000Z'),
      createdAt: new Date('2026-07-12T02:00:00.000Z'),
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        lastCompletedImportRunId: current.id,
      },
    });

    const snapshot = await service.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 10,
      stockStatus: 'all',
    });

    expect(snapshot.latestImport).toMatchObject({
      id: current.id,
      fileName: 'current-basis.xls',
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
      updatedAt: new Date('2026-07-15T00:00:00.000Z'),
    });
    const failed = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: null,
        fileHash: null,
        status: 'failed',
        rowCount: 0,
        importedAt: null,
        lastTrigger: 'manual_request',
        freshnessGeneration: 2n,
        errorCode: 'sellpia_network_failed',
        errorMessage: 'network failed',
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        updatedAt: new Date('2026-07-13T00:00:00.000Z'),
      },
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

    expect(history.items.map(({ id }) => id)).toEqual([older.id, failed.id]);
    expect(history.items[1]).toMatchObject({
      status: 'failed',
      fileName: null,
      fileHash: null,
      importedAt: null,
      lastTrigger: 'manual_request',
      freshnessGeneration: '2',
      errorCode: 'sellpia_network_failed',
    });
  });

  function createRun(input: {
    organizationId: string;
    fileName: string;
    fileHash: string;
    status: string;
    rowCount: number;
    importedAt: Date | null;
    createdAt: Date;
    updatedAt?: Date;
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
        updatedAt: input.updatedAt,
      },
    });
  }
});
