import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { SupplierStatsService } from '../supplier-stats.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';

describe('SupplierStatsService physical-Master projection (PG)', () => {
  let prisma: PrismaClient;
  let service: SupplierStatsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const module = await Test.createTestingModule({
      providers: [
        SupplierStatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(SupplierStatsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedPhysicalProduct(
    organizationId: string,
    suffix: string,
    name: string,
  ) {
    const sellpiaProductCode = `SP-${suffix}`;
    const master = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: `PHYSICAL-${suffix}`,
        name: `Legacy ${name}`,
        sellpiaProductCode,
        sellpiaName: name,
        currentStock: 100,
        isActive: true,
      },
    });
    const inventorySku = await prisma.inventorySku.create({
      data: {
        organizationId,
        sellpiaProductCode,
        name,
        currentStock: 100,
      },
    });
    await prisma.inventorySkuMasterProductMap.create({
      data: {
        organizationId,
        inventorySkuId: inventorySku.id,
        masterProductId: master.id,
        resolution: 'shared_uuid',
      },
    });
    return { master, inventorySku };
  }

  async function seedSupplierPolicy(params: {
    organizationId: string;
    supplierName: string;
    masterProductId: string;
    supplyPrice: number;
    isPrimary?: boolean;
  }) {
    const supplier = await prisma.supplier.create({
      data: { organizationId: params.organizationId, name: params.supplierName },
    });
    await prisma.supplierProduct.create({
      data: {
        organizationId: params.organizationId,
        supplierId: supplier.id,
        masterProductId: params.masterProductId,
        optionId: null,
        supplyPrice: params.supplyPrice,
        minOrderQty: 1,
        isPrimary: params.isPrimary ?? true,
      },
    });
    return supplier;
  }

  async function seedListingOption(
    organizationId: string,
    suffix: string,
    components: Array<{
      inventorySkuId: string;
      masterProductId: string;
      quantity: number;
    }>,
  ) {
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channel: 'coupang',
        externalId: `PRODUCT-${suffix}`,
        channelName: `Listing ${suffix}`,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: `SKU-${suffix}`,
        mappingStatus: 'matched',
      },
    });
    await prisma.channelSkuComponent.createMany({
      data: components.map((component) => ({
        organizationId,
        channelSkuId: listingOption.id,
        inventorySkuId: component.inventorySkuId,
        masterProductId: component.masterProductId,
        quantity: component.quantity,
        mappingSource: 'manual',
      })),
    });
    return listingOption;
  }

  async function seedOrderLine(params: {
    organizationId: string;
    suffix: string;
    listingOptionId: string | null;
    quantity: number;
    totalPrice: number;
    status?: string;
  }) {
    const order = await prisma.order.create({
      data: {
        organizationId: params.organizationId,
        platform: 'coupang',
        externalOrderId: `ORDER-${params.suffix}`,
        status: params.status ?? 'paid',
        totalPrice: params.totalPrice,
        orderedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: params.organizationId,
        orderId: order.id,
        listingOptionId: params.listingOptionId,
        quantity: params.quantity,
        unitPrice: Math.trunc(params.totalPrice / params.quantity),
        totalPrice: params.totalPrice,
      },
    });
  }

  it('allocates one bundle line by extended component cost and preserves physical quantities', async () => {
    const first = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'A', '상품 A');
    const second = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'B', '상품 B');
    const firstSupplier = await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Supplier A',
      masterProductId: first.master.id,
      supplyPrice: 100,
    });
    const secondSupplier = await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Supplier B',
      masterProductId: second.master.id,
      supplyPrice: 300,
    });
    const listingOption = await seedListingOption(TEST_ORGANIZATION_ID, 'BUNDLE', [
      { inventorySkuId: first.inventorySku.id, masterProductId: first.master.id, quantity: 1 },
      { inventorySkuId: second.inventorySku.id, masterProductId: second.master.id, quantity: 3 },
    ]);
    await seedOrderLine({
      organizationId: TEST_ORGANIZATION_ID,
      suffix: 'BUNDLE',
      listingOptionId: listingOption.id,
      quantity: 2,
      totalPrice: 10_000,
    });

    const report = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);
    const bySupplier = new Map(report.items.map((item) => [item.supplierId, item]));

    expect(report.summary).toEqual({
      supplierCount: 2,
      productCount: 2,
      totalOrders: 2,
      totalQuantity: 8,
      totalRevenue: 10_000,
      unallocatedRevenue: 0,
    });
    expect(bySupplier.get(firstSupplier.id)).toMatchObject({
      totalQuantity: 2,
      totalRevenue: 1_000,
    });
    expect(bySupplier.get(secondSupplier.id)).toMatchObject({
      totalQuantity: 6,
      totalRevenue: 9_000,
    });
  });

  it('does not partially allocate a line whose component policy is incomplete', async () => {
    const known = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'KNOWN', 'Known');
    const unknown = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'UNKNOWN', 'Unknown');
    await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Known Supplier',
      masterProductId: known.master.id,
      supplyPrice: 500,
    });
    const listingOption = await seedListingOption(TEST_ORGANIZATION_ID, 'INCOMPLETE', [
      { inventorySkuId: known.inventorySku.id, masterProductId: known.master.id, quantity: 8 },
      { inventorySkuId: unknown.inventorySku.id, masterProductId: unknown.master.id, quantity: 1 },
    ]);
    await seedOrderLine({
      organizationId: TEST_ORGANIZATION_ID,
      suffix: 'INCOMPLETE',
      listingOptionId: listingOption.id,
      quantity: 1,
      totalPrice: 12_000,
    });

    const report = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

    expect(report.summary).toMatchObject({
      totalQuantity: 8,
      totalRevenue: 0,
      unallocatedRevenue: 12_000,
    });
  });

  it('scopes suppliers and order lines by organization', async () => {
    const own = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'OWN', 'Own');
    await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Own Supplier',
      masterProductId: own.master.id,
      supplyPrice: 100,
    });
    const ownOption = await seedListingOption(TEST_ORGANIZATION_ID, 'OWN', [{
      inventorySkuId: own.inventorySku.id,
      masterProductId: own.master.id,
      quantity: 1,
    }]);
    await seedOrderLine({
      organizationId: TEST_ORGANIZATION_ID,
      suffix: 'OWN',
      listingOptionId: ownOption.id,
      quantity: 1,
      totalPrice: 1_000,
    });

    const foreign = await seedPhysicalProduct(OTHER_ORGANIZATION_ID, 'FOREIGN', 'Foreign');
    await seedSupplierPolicy({
      organizationId: OTHER_ORGANIZATION_ID,
      supplierName: 'Foreign Supplier',
      masterProductId: foreign.master.id,
      supplyPrice: 100,
    });
    const foreignOption = await seedListingOption(OTHER_ORGANIZATION_ID, 'FOREIGN', [{
      inventorySkuId: foreign.inventorySku.id,
      masterProductId: foreign.master.id,
      quantity: 1,
    }]);
    await seedOrderLine({
      organizationId: OTHER_ORGANIZATION_ID,
      suffix: 'FOREIGN',
      listingOptionId: foreignOption.id,
      quantity: 1,
      totalPrice: 999_999,
    });

    const report = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

    expect(report.items.map((item) => item.supplierName)).toEqual(['Own Supplier']);
    expect(report.summary.totalRevenue).toBe(1_000);
  });

  it('returns Sellpia Master identity in the supplier product breakdown', async () => {
    const physical = await seedPhysicalProduct(
      TEST_ORGANIZATION_ID,
      'MALLOW',
      '우파루팡반짝슈가말랑이',
    );
    const supplier = await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Supplier',
      masterProductId: physical.master.id,
      supplyPrice: 1_000,
    });
    const listingOption = await seedListingOption(TEST_ORGANIZATION_ID, 'MALLOW', [{
      inventorySkuId: physical.inventorySku.id,
      masterProductId: physical.master.id,
      quantity: 8,
    }]);
    await seedOrderLine({
      organizationId: TEST_ORGANIZATION_ID,
      suffix: 'MALLOW',
      listingOptionId: listingOption.id,
      quantity: 1,
      totalPrice: 16_000,
    });

    const report = await service.getProductSales(TEST_ORGANIZATION_ID, supplier.id);

    expect(report.items).toEqual([expect.objectContaining({
      masterId: physical.master.id,
      masterCode: 'SP-MALLOW',
      masterName: '우파루팡반짝슈가말랑이',
      totalQuantity: 8,
      totalRevenue: 16_000,
    })]);
    expect(report.items[0]).not.toHaveProperty('optionId');
  });
});
