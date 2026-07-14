import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ChannelSyncService } from '../application/service/channel-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangProviderPort,
} from '../application/port/out/provider/coupang-provider.port';
import { ChannelSyncRepositoryAdapter } from '../adapter/out/repository/channel-sync.repository.adapter';
import { CHANNEL_SYNC_REPOSITORY_PORT } from '../application/port/out/repository/channel-sync.repository.port';
import { ChannelAccountService } from '../application/service/channel-account.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

describe('Order sync (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelSyncService;
  let repository: ChannelSyncRepositoryAdapter;
  let channelAccountId: string;
  const organizationId = TEST_ORGANIZATION_ID;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const coupangPortStub: CoupangProviderPort = {
      getDeliveryCompanies: () => [],
      getSellerProducts: async () => ({ code: 'SUCCESS', message: 'OK' }),
      getSellerProduct: async () => ({ code: 'SUCCESS', message: 'OK' }),
      getOrderSheets: async () => ({ code: 'SUCCESS', message: 'OK' }),
      confirmOrderSheets: async () => ({}),
      uploadInvoice: async () => ({}),
      approveReturn: async () => ({}),
    };
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        ChannelSyncRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: CHANNEL_SYNC_REPOSITORY_PORT, useExisting: ChannelSyncRepositoryAdapter },
        {
          provide: ChannelAccountService,
          useValue: {
            getCoupangSettings: async () => ({
              configured: true,
              vendorId: 'TEST_VENDOR',
              accessKeyMasked: 'TEST********KEY',
              hasAccessKey: true,
              hasSecretKey: true,
              status: 'active',
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            }),
          },
        },
        { provide: COUPANG_PROVIDER_PORT, useValue: coupangPortStub },
      ],
    }).compile();
    service = m.get(ChannelSyncService);
    repository = m.get(ChannelSyncRepositoryAdapter);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const account = await prisma.channelAccount.create({
      data: {
        organizationId,
        channel: 'coupang',
        name: 'Primary Wing',
        externalAccountId: 'ORDER-SYNC-PRIMARY',
        isPrimary: true,
        status: 'active',
      },
    });
    channelAccountId = account.id;
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
      organizationId,
    );

    const orders = await prisma.order.findMany({
      where: { organizationId },
      include: { lineItems: true },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].channelAccountId).toBe(channelAccountId);
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
    await (service as any).syncSingleOrder(basePayload, organizationId);

    const updatedPayload = {
      ...basePayload,
      status: 'INSTRUCT',
      orderItems: [
        { ...basePayload.orderItems[0], shippingCount: 5, orderPrice: 500 },
      ],
    };
    await (service as any).syncSingleOrder(updatedPayload, organizationId);

    const orders = await prisma.order.findMany({
      where: { organizationId },
      include: { lineItems: true },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('INSTRUCT');
    expect(orders[0].totalPrice).toBe(500);
    expect(orders[0].lineItems).toHaveLength(1);
    expect(orders[0].lineItems[0].quantity).toBe(5);
  });

  it('vendorItemId match links listingOption and preserves provider SKU without ProductOption ownership', async () => {
    const sellerSku = `SKU-${Date.now()}`;
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId,
        externalId: `LST-${Date.now()}`,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: 'V_KNOWN',
        itemName: 'Red',
        sellerSku,
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
      organizationId,
    );

    const lineItems = await prisma.orderLineItem.findMany({
      where: { organizationId },
    });
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].listingOptionId).toBe(listingOption.id);
    expect(lineItems[0].sku).toBe(sellerSku);
  });

  it('vendorItemId no match → listingOptionId null (graceful)', async () => {
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
      organizationId,
    );

    const lineItems = await prisma.orderLineItem.findMany({
      where: { organizationId },
    });
    expect(lineItems).toHaveLength(1);
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
      organizationId,
    );

    const returns = await prisma.orderReturn.findMany({
      where: { organizationId },
      include: { lineItems: true },
    });
    expect(returns).toHaveLength(1);
    expect(returns[0].channelAccountId).toBe(channelAccountId);
    expect(returns[0].externalReturnId).toBe('RCT-1');
    expect(returns[0].type).toBe('RETURN');
    expect(returns[0].lineItems).toHaveLength(2);
    const names = returns[0].lineItems.map((li) => li.productName).sort();
    expect(names).toEqual(['Book', 'Toy']);
  });

  it('scopes identical external order IDs independently to each ChannelAccount', async () => {
    const secondAccount = await prisma.channelAccount.create({
      data: {
        organizationId,
        channel: 'coupang',
        name: 'Secondary Wing',
        externalAccountId: 'ORDER-SYNC-SECONDARY',
        status: 'active',
      },
    });
    const payload = {
      shipmentBoxId: 'SBX-SHARED',
      orderId: 'CO-SHARED',
      status: 'ACCEPT',
      orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{
        vendorItemId: 'V-SHARED',
        sellerProductName: 'Shared external order',
        shippingCount: 1,
        salesPrice: 100,
        orderPrice: 100,
      }],
    };

    await repository.syncSingleOrder(organizationId, channelAccountId, payload as never);
    await repository.syncSingleOrder(organizationId, secondAccount.id, payload as never);

    const orders = await prisma.order.findMany({
      where: { organizationId, externalOrderId: 'SBX-SHARED' },
      orderBy: { channelAccountId: 'asc' },
    });
    expect(orders).toHaveLength(2);
    expect(new Set(orders.map((order) => order.channelAccountId))).toEqual(
      new Set([channelAccountId, secondAccount.id]),
    );
  });
});
