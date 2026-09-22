import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { seedCompletedOrderCoverageRun } from '../../../test-helpers/finance-seeds';
import { ProductSourceReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { PRODUCT_SOURCE_READ_PORT } from '../../../products/application/port/in/product-source-read.port';
import { seedSourceProduct } from '../../../test-helpers/inventory-seeds';

describe('SupplierStatsService physical Sellpia SKU projection (PG)', () => {
  let prisma: PrismaClient;
  let service: SupplierStatsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const module = await Test.createTestingModule({
      providers: [
        SupplierStatsService,
        { provide: PRODUCT_SOURCE_READ_PORT, useValue: new ProductSourceReadRepositoryAdapter(prisma as never) },
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
    const sku = await seedSourceProduct(prisma, {
      organizationId,
      code: sellpiaProductCode,
      name,
      currentStock: 100,
    });
    return sku;
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
        supplyPrice: params.supplyPrice,
        isPrimary: params.isPrimary ?? true,
      },
    });
    return supplier;
  }

  async function seedListingOption(
    organizationId: string,
    suffix: string,
    components: Array<{
      masterProductId: string;
      quantity: number;
    }>,
  ) {
    const master = await seedSourceProduct(prisma, {
      organizationId,
      code: `LISTING-${suffix}`,
      name: `Operating ${suffix}`,
    });
    const channelAccount = await prisma.channelAccount.upsert({
      where: {
        organizationId_channel_externalAccountId: {
          organizationId,
          channel: 'coupang',
          externalAccountId: 'supplier-stats-test',
        },
      },
      create: {
        organizationId,
        channel: 'coupang',
        name: 'Supplier stats test account',
        externalAccountId: 'supplier-stats-test',
      },
      update: {},
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId: channelAccount.id,
        externalId: `PRODUCT-${suffix}`,
        channelName: `Listing ${suffix}`,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: `SKU-${suffix}`,
      },
    });
    await prisma.channelListingOptionInventoryComponent.createMany({
      data: components.map((component) => ({
        organizationId,
        channelListingOptionId: listingOption.id,
        masterProductId: component.masterProductId,
        quantity: component.quantity,
      })),
    });
    return listingOption;
  }

  /**
   * One order line. By default a completed Orders collection publishes every
   * order seeded so far; `published: false` leaves this one outside any
   * completed collection.
   */
  async function seedOrderLine(params: {
    organizationId: string;
    suffix: string;
    listingOptionId: string | null;
    quantity: number;
    totalPrice: number;
    status?: string;
    published?: boolean;
  }) {
    const channelAccountId = params.listingOptionId
      ? await prisma.channelListingOption.findFirstOrThrow({
          where: {
            id: params.listingOptionId,
            organizationId: params.organizationId,
          },
          select: { listing: { select: { channelAccountId: true } } },
        }).then((option) => option.listing.channelAccountId)
      : await prisma.channelAccount.findFirstOrThrow({
          where: { organizationId: params.organizationId, channel: 'coupang' },
          select: { id: true },
        }).then((account) => account.id);
    const order = await prisma.order.create({
      data: {
        organizationId: params.organizationId,
        channelAccountId,
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
    if (params.published ?? true) {
      await seedCompletedOrderCoverageRun(prisma, {
        organizationId: params.organizationId,
        startDate: '2026-07-01',
        endDate: '2026-07-01',
      });
    }
  }

  it('allocates one bundle line by extended component cost and preserves physical quantities', async () => {
    const first = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'A', '상품 A');
    const second = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'B', '상품 B');
    const firstSupplier = await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Supplier A',
      masterProductId: first.id,
      supplyPrice: 100,
    });
    const secondSupplier = await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Supplier B',
      masterProductId: second.id,
      supplyPrice: 300,
    });
    const listingOption = await seedListingOption(TEST_ORGANIZATION_ID, 'BUNDLE', [
      { masterProductId: first.id, quantity: 1 },
      { masterProductId: second.id, quantity: 3 },
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
      masterProductId: known.id,
      supplyPrice: 500,
    });
    const listingOption = await seedListingOption(TEST_ORGANIZATION_ID, 'INCOMPLETE', [
      { masterProductId: known.id, quantity: 8 },
      { masterProductId: unknown.id, quantity: 1 },
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

  it('counts only order lines a completed Orders collection published', async () => {
    const physical = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'PUBLISHED', 'Published');
    await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Published Supplier',
      masterProductId: physical.id,
      supplyPrice: 100,
    });
    const listingOption = await seedListingOption(TEST_ORGANIZATION_ID, 'PUBLISHED', [{
      masterProductId: physical.id,
      quantity: 1,
    }]);
    await seedOrderLine({
      organizationId: TEST_ORGANIZATION_ID,
      suffix: 'PUBLISHED',
      listingOptionId: listingOption.id,
      quantity: 1,
      totalPrice: 1_000,
    });
    await seedOrderLine({
      organizationId: TEST_ORGANIZATION_ID,
      suffix: 'UNPUBLISHED',
      listingOptionId: listingOption.id,
      quantity: 5,
      totalPrice: 999_999,
      published: false,
    });

    const report = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

    expect(report.summary).toMatchObject({
      totalOrders: 1,
      totalQuantity: 1,
      totalRevenue: 1_000,
      unallocatedRevenue: 0,
    });
  });

  /** KID-85 follow-up F-1 — an all-time read must not run inside Prisma's 5 s interactive transaction. */
  it('reads its projection without an interactive transaction', async () => {
    const physical = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'NO-TX', 'No transaction');
    await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'No Transaction Supplier',
      masterProductId: physical.id,
      supplyPrice: 100,
    });
    const listingOption = await seedListingOption(TEST_ORGANIZATION_ID, 'NO-TX', [{
      masterProductId: physical.id,
      quantity: 2,
    }]);
    await seedOrderLine({
      organizationId: TEST_ORGANIZATION_ID,
      suffix: 'NO-TX',
      listingOptionId: listingOption.id,
      quantity: 3,
      totalPrice: 4_500,
    });

    const transaction = vi.spyOn(prisma, '$transaction');
    try {
      const report = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

      expect(report.summary).toMatchObject({
        totalOrders: 1,
        totalQuantity: 6,
        totalRevenue: 4_500,
        unallocatedRevenue: 0,
      });
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
    }
  });

  it('scopes suppliers and order lines by organization', async () => {
    const own = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'OWN', 'Own');
    await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Own Supplier',
      masterProductId: own.id,
      supplyPrice: 100,
    });
    const ownOption = await seedListingOption(TEST_ORGANIZATION_ID, 'OWN', [{
      masterProductId: own.id,
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
      masterProductId: foreign.id,
      supplyPrice: 100,
    });
    const foreignOption = await seedListingOption(OTHER_ORGANIZATION_ID, 'FOREIGN', [{
      masterProductId: foreign.id,
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

  it('returns Sellpia inventory-SKU identity in the supplier product breakdown', async () => {
    const physical = await seedPhysicalProduct(
      TEST_ORGANIZATION_ID,
      'MALLOW',
      '우파루팡반짝슈가말랑이',
    );
    const supplier = await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID,
      supplierName: 'Supplier',
      masterProductId: physical.id,
      supplyPrice: 1_000,
    });
    const listingOption = await seedListingOption(TEST_ORGANIZATION_ID, 'MALLOW', [{
      masterProductId: physical.id,
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
      masterId: physical.id,
      masterCode: physical.code,
      masterName: '우파루팡반짝슈가말랑이',
      totalQuantity: 8,
      totalRevenue: 16_000,
    })]);
    expect(report.items[0]).not.toHaveProperty('optionId');
  });
  it('keeps supplier policy history but omits a deleted or foreign inventory identity', async () => {
    const physical = await seedPhysicalProduct(TEST_ORGANIZATION_ID, 'DELETED', 'Synthetic SKU');
    const supplier = await seedSupplierPolicy({
      organizationId: TEST_ORGANIZATION_ID, supplierName: 'Synthetic supplier',
      masterProductId: physical.id, supplyPrice: 100,
    });
    await prisma.masterProduct.delete({ where: { id: physical.id } });
    expect(await service.getProductSales(TEST_ORGANIZATION_ID, supplier.id)).toMatchObject({ items: [] });
    expect(await prisma.supplierProduct.findFirst({ where: { supplierId: supplier.id } }))
      .toMatchObject({ masterProductId: physical.id });
    const foreign = await seedPhysicalProduct(OTHER_ORGANIZATION_ID, 'FOREIGN', 'Foreign synthetic SKU');
    await prisma.supplierProduct.updateMany({ where: { supplierId: supplier.id }, data: { masterProductId: foreign.id } });
    expect(await service.getProductSales(TEST_ORGANIZATION_ID, supplier.id)).toMatchObject({ items: [] });
  });

});
