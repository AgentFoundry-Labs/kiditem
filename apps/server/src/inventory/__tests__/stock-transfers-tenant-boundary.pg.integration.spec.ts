import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { TransfersRepositoryAdapter } from '../adapter/out/repository/transfers.repository.adapter';
import { TransfersService } from '../application/service/transfers.service';

const INVENTORY_SKU_ID = '10000000-0000-4000-8000-000000000001';
const OWN_WAREHOUSE_ID = '10000000-0000-4000-8000-000000000002';
const FOREIGN_WAREHOUSE_ID = '10000000-0000-4000-8000-000000000003';

describe('stock transfer tenant boundary (PG integration)', () => {
  let prisma: PrismaClient;
  let service: TransfersService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new TransfersService(
      new TransfersRepositoryAdapter(prisma as unknown as PrismaService),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.inventorySku.create({
      data: {
        id: INVENTORY_SKU_ID,
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: 'SP-TRANSFER',
        name: '이동 상품',
        currentStock: 10,
      },
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: OWN_WAREHOUSE_ID,
          organizationId: TEST_ORGANIZATION_ID,
          name: '자체 창고',
          code: 'OWN',
        },
        {
          id: FOREIGN_WAREHOUSE_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          name: '타 조직 창고',
          code: 'FOREIGN',
        },
      ],
    });
  });

  it('rejects a foreign destination warehouse without creating a transfer', async () => {
    await expect(service.create(TEST_ORGANIZATION_ID, {
      inventorySkuId: INVENTORY_SKU_ID,
      fromWarehouseId: OWN_WAREHOUSE_ID,
      toWarehouseId: FOREIGN_WAREHOUSE_ID,
      quantity: 1,
    })).rejects.toBeInstanceOf(NotFoundException);

    await expect(prisma.stockTransfer.count()).resolves.toBe(0);
  });

  it('enforces the warehouse organization boundary in the database', async () => {
    await expect(prisma.stockTransfer.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        inventorySkuId: INVENTORY_SKU_ID,
        fromWarehouseId: OWN_WAREHOUSE_ID,
        toWarehouseId: FOREIGN_WAREHOUSE_ID,
        quantity: 1,
      },
    })).rejects.toThrow();

    await expect(prisma.stockTransfer.count()).resolves.toBe(0);
  });
});
