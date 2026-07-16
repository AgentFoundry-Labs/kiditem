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
import { PickingRepositoryAdapter } from '../adapter/out/repository/picking.repository.adapter';
import { TransfersService } from '../application/service/transfers.service';

const SELLPIA_INVENTORY_SKU_ID = '10000000-0000-4000-8000-000000000001';
const FOREIGN_SELLPIA_INVENTORY_SKU_ID = '10000000-0000-4000-8000-000000000005';
const OWN_WAREHOUSE_ID = '10000000-0000-4000-8000-000000000002';
const FOREIGN_WAREHOUSE_ID = '10000000-0000-4000-8000-000000000003';
const OWN_WAREHOUSE_2_ID = '10000000-0000-4000-8000-000000000004';

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
    await prisma.sellpiaInventorySku.create({
      data: {
        id: SELLPIA_INVENTORY_SKU_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-TRANSFER',
        name: '이동 상품',
        currentStock: 10,
      },
    });
    await prisma.sellpiaInventorySku.create({
      data: {
        id: FOREIGN_SELLPIA_INVENTORY_SKU_ID,
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'SP-FOREIGN',
        name: '타 조직 상품',
        currentStock: 8,
      },
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: OWN_WAREHOUSE_2_ID,
          organizationId: TEST_ORGANIZATION_ID,
          name: '자체 창고 2',
          code: 'OWN-2',
        },
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
      sellpiaInventorySkuId: SELLPIA_INVENTORY_SKU_ID,
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
        sellpiaInventorySkuId: SELLPIA_INVENTORY_SKU_ID,
        fromWarehouseId: OWN_WAREHOUSE_ID,
        toWarehouseId: FOREIGN_WAREHOUSE_ID,
        quantity: 1,
      },
    })).rejects.toThrow();

    await expect(prisma.stockTransfer.count()).resolves.toBe(0);
  });

  it('rejects a foreign physical SKU for transfer, picking, and return records', async () => {
    await expect(service.create(TEST_ORGANIZATION_ID, {
      sellpiaInventorySkuId: FOREIGN_SELLPIA_INVENTORY_SKU_ID,
      fromWarehouseId: OWN_WAREHOUSE_ID,
      toWarehouseId: OWN_WAREHOUSE_2_ID,
      quantity: 1,
    })).rejects.toBeInstanceOf(NotFoundException);

    const picking = new PickingRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    await expect(picking.createPickingList(
      TEST_ORGANIZATION_ID,
      'PK-FOREIGN-SKU',
      [{
        orderId: '20000000-0000-4000-8000-000000000002',
        sellpiaInventorySkuId: FOREIGN_SELLPIA_INVENTORY_SKU_ID,
        productName: '타 조직 상품',
        sku: 'SP-FOREIGN',
        quantity: 1,
      }],
    )).rejects.toBeInstanceOf(NotFoundException);

    await expect(prisma.returnTransfer.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        rtNumber: 'RT-FOREIGN-SKU',
        sellpiaInventorySkuId: FOREIGN_SELLPIA_INVENTORY_SKU_ID,
        quantity: 1,
      },
    })).rejects.toThrow();

    await expect(prisma.stockTransfer.count()).resolves.toBe(0);
    await expect(prisma.pickingList.count()).resolves.toBe(0);
    await expect(prisma.returnTransfer.count()).resolves.toBe(0);

    const stocks = await prisma.sellpiaInventorySku.findMany({
      where: {
        id: { in: [SELLPIA_INVENTORY_SKU_ID, FOREIGN_SELLPIA_INVENTORY_SKU_ID] },
      },
      select: { id: true, currentStock: true },
      orderBy: { id: 'asc' },
    });
    expect(stocks).toEqual([
      { id: SELLPIA_INVENTORY_SKU_ID, currentStock: 10 },
      { id: FOREIGN_SELLPIA_INVENTORY_SKU_ID, currentStock: 8 },
    ]);
  });

  it('records transfer, picking, and return movement without changing current stock', async () => {
    const transfer = await service.create(TEST_ORGANIZATION_ID, {
      sellpiaInventorySkuId: SELLPIA_INVENTORY_SKU_ID,
      fromWarehouseId: OWN_WAREHOUSE_ID,
      toWarehouseId: OWN_WAREHOUSE_2_ID,
      quantity: 2,
    });
    await service.update(transfer.id, { status: 'in_transit' }, TEST_ORGANIZATION_ID);
    await service.update(transfer.id, { status: 'completed' }, TEST_ORGANIZATION_ID);

    const picking = new PickingRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const list = await picking.createPickingList(
      TEST_ORGANIZATION_ID,
      'PK-RECORD-ONLY',
      [{
        orderId: '20000000-0000-4000-8000-000000000001',
        sellpiaInventorySkuId: SELLPIA_INVENTORY_SKU_ID,
        productName: '이동 상품',
        sku: 'SP-TRANSFER',
        quantity: 3,
      }],
    );
    await picking.completePickingList(list.id, TEST_ORGANIZATION_ID);

    const movement = await prisma.returnTransfer.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        rtNumber: 'RT-RECORD-ONLY',
        sellpiaInventorySkuId: SELLPIA_INVENTORY_SKU_ID,
        quantity: 1,
      },
    });
    await prisma.returnTransfer.update({
      where: { id: movement.id },
      data: { status: 'completed', completedAt: new Date() },
    });

    const sku = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: SELLPIA_INVENTORY_SKU_ID },
    });
    expect(sku.currentStock).toBe(10);
  });
});
