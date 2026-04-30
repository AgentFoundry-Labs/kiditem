import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ChannelSyncService } from '../application/service/channel-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangProviderPort,
} from '../application/port/out/coupang-provider.port';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('Order sync (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelSyncService;
  const companyId = TEST_COMPANY_ID;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const coupangPortStub: CoupangProviderPort = {
      getVendorId: () => 'TEST_VENDOR',
      getSellerProducts: async () => ({ code: 'SUCCESS', message: 'OK' }),
      getSellerProduct: async () => ({ code: 'SUCCESS', message: 'OK' }),
      getOrderSheets: async () => ({ code: 'SUCCESS', message: 'OK' }),
    };
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: COUPANG_PROVIDER_PORT, useValue: coupangPortStub },
      ],
    }).compile();
    service = m.get(ChannelSyncService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('first sync creates Order + OrderLineItem', async () => {
    await (service as any).syncSingleOrder(
      {
        shipmentBoxId: 'SBX-1',
        orderId: 'CO-1',
        status: 'ACCEPT',
        orderedAt: '2026-04-18T00:00:00Z',
        orderItems: [
          {
            vendorItemId: 'V1',
            sellerProductName: 'Toy',
            shippingCount: 2,
            salesPrice: 100,
            orderPrice: 200,
          },
        ],
      },
      companyId,
    );

    const orders = await prisma.order.findMany({
      where: { companyId },
      include: { lineItems: true },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].platform).toBe('coupang');
    expect(orders[0].externalOrderId).toBe('SBX-1');
    expect(orders[0].externalNumber).toBe('CO-1');
    expect(orders[0].totalPrice).toBe(200);
    expect(orders[0].lineItems).toHaveLength(1);
    expect(orders[0].lineItems[0].quantity).toBe(2);
    expect(orders[0].lineItems[0].externalLineId).toBe('V1');
  });

  it('second sync of same shipmentBoxId updates (no duplicate)', async () => {
    const basePayload = {
      shipmentBoxId: 'SBX-1',
      orderId: 'CO-1',
      status: 'ACCEPT',
      orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [
        {
          vendorItemId: 'V1',
          sellerProductName: 'Toy',
          shippingCount: 1,
          salesPrice: 100,
          orderPrice: 100,
        },
      ],
    };
    await (service as any).syncSingleOrder(basePayload, companyId);

    const updatedPayload = {
      ...basePayload,
      status: 'INSTRUCT',
      orderItems: [
        { ...basePayload.orderItems[0], shippingCount: 5, orderPrice: 500 },
      ],
    };
    await (service as any).syncSingleOrder(updatedPayload, companyId);

    const orders = await prisma.order.findMany({
      where: { companyId },
      include: { lineItems: true },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('INSTRUCT');
    expect(orders[0].totalPrice).toBe(500);
    expect(orders[0].lineItems).toHaveLength(1);
    expect(orders[0].lineItems[0].quantity).toBe(5);
  });

  it('vendorItemId match → optionId + sku denormalized', async () => {
    const master = await prisma.masterProduct.create({
      data: {
        companyId,
        code: `M-${Date.now()}`,
        name: 'Master',
        optionCounter: 1,
      },
    });
    const option = await prisma.productOption.create({
      data: {
        companyId,
        masterId: master.id,
        sku: `SKU-${Date.now()}`,
        optionName: 'Red',
        isBundle: false,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        companyId,
        masterId: master.id,
        channel: 'coupang',
        externalId: `LST-${Date.now()}`,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        companyId,
        listingId: listing.id,
        optionId: option.id,
        externalOptionId: 'V_KNOWN',
        itemName: 'Red',
      },
    });

    await (service as any).syncSingleOrder(
      {
        shipmentBoxId: 'SBX-2',
        orderId: 'CO-2',
        status: 'ACCEPT',
        orderedAt: '2026-04-18T00:00:00Z',
        orderItems: [
          {
            vendorItemId: 'V_KNOWN',
            sellerProductName: 'Toy',
            shippingCount: 1,
            salesPrice: 100,
            orderPrice: 100,
          },
        ],
      },
      companyId,
    );

    const lineItems = await prisma.orderLineItem.findMany({
      where: { companyId },
    });
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].listingOptionId).toBe(listingOption.id);
    expect(lineItems[0].optionId).toBe(option.id);
    expect(lineItems[0].sku).toBe(option.sku);
  });

  it('vendorItemId no match → optionId/listingOptionId null (graceful)', async () => {
    await (service as any).syncSingleOrder(
      {
        shipmentBoxId: 'SBX-3',
        orderId: 'CO-3',
        status: 'ACCEPT',
        orderedAt: '2026-04-18T00:00:00Z',
        orderItems: [
          {
            vendorItemId: 'V_UNKNOWN',
            sellerProductName: 'Mystery',
            shippingCount: 1,
            salesPrice: 50,
            orderPrice: 50,
          },
        ],
      },
      companyId,
    );

    const lineItems = await prisma.orderLineItem.findMany({
      where: { companyId },
    });
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].optionId).toBeNull();
    expect(lineItems[0].listingOptionId).toBeNull();
  });

  it('return sync — items JSON normalized to OrderReturnLineItem', async () => {
    await (service as any).syncSingleReturn(
      {
        receiptId: 'RCT-1',
        receiptType: 'RETURN',
        receiptStatus: 'UC',
        orderId: null,
        cancelReason: 'damaged',
        faultByType: 'CUSTOMER',
        requesterName: 'Alice',
        requestedAt: '2026-04-18T00:00:00Z',
        items: [
          { productName: 'Toy', quantity: 1 },
          { productName: 'Book', quantity: 2 },
        ],
      },
      companyId,
    );

    const returns = await prisma.orderReturn.findMany({
      where: { companyId },
      include: { lineItems: true },
    });
    expect(returns).toHaveLength(1);
    expect(returns[0].platform).toBe('coupang');
    expect(returns[0].externalReturnId).toBe('RCT-1');
    expect(returns[0].type).toBe('RETURN');
    expect(returns[0].lineItems).toHaveLength(2);
    const names = returns[0].lineItems.map((li) => li.productName).sort();
    expect(names).toEqual(['Book', 'Toy']);
  });
});
