import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { InventorySkuSnapshotListRepositoryAdapter } from '../adapter/out/persistence/inventory-sku-snapshot-list.repository.adapter';
import { InventorySkuSnapshotListService } from '../application/usecase/inventory-sku-snapshot-list.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

describe('Sellpia snapshot detail tenant boundary (PG integration)', () => {
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

  it('returns only a Sellpia inventory SKU owned by the current organization', async () => {
    const run = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'detail.xlsx',
        fileHash: 'd'.repeat(64),
        status: 'completed',
        rowCount: 1,
        importedAt: new Date('2026-07-12T00:00:00.000Z'),
        lastVerifiedAt: new Date('2026-07-12T00:00:00.000Z'),
        freshnessGeneration: 1n,
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        lastCompletedImportRunId: run.id,
        lastVerifiedAt: new Date('2026-07-12T00:00:00.000Z'),
        verifiedGeneration: 1n,
      },
    });
    const [own, other] = await Promise.all([
      prisma.sellpiaInventorySku.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-SAME',
          name: '우리 상품',
          currentStock: 3,
          purchasePrice: 1_000,
          lastImportRunId: run.id,
        },
      }),
      prisma.sellpiaInventorySku.create({
        data: {
          organizationId: OTHER_ORGANIZATION_ID,
          code: 'SP-SAME',
          name: '다른 조직 상품',
          currentStock: 999,
        },
      }),
    ]);

    await expect(service.getSnapshot(TEST_ORGANIZATION_ID, own.id)).resolves.toMatchObject({
      sellpiaInventorySkuId: own.id,
      code: 'SP-SAME',
      name: '우리 상품',
      currentStock: 3,
      stockValue: 3_000,
      linkedProductCount: 0,
      linkedChannelOptionCount: 0,
    });
    await expect(service.getSnapshot(TEST_ORGANIZATION_ID, other.id)).rejects.toMatchObject({
      name: 'FactNotFoundError',
    });
  });
});
