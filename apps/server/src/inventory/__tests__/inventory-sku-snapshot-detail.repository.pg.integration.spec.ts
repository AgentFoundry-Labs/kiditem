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
    const [own, other] = await Promise.all([
      prisma.sellpiaInventorySku.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-SAME',
          name: '우리 상품',
          currentStock: 3,
          purchasePrice: 1_000,
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
      linkedVariantCount: 0,
      linkedProductCount: 0,
      linkStatus: 'unlinked',
    });
    await expect(service.getSnapshot(TEST_ORGANIZATION_ID, other.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
