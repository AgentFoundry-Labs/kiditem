import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ChannelSyncService } from '../channel-sync.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ChannelSyncService.syncSingleOrder (Plan A.5)', () => {
  let service: ChannelSyncService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      order: { upsert: vi.fn() },
      orderLineItem: { upsert: vi.fn() },
      channelListingOption: { findUnique: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    };
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(ChannelSyncService);
  });

  it('upserts Order with platform=coupang + externalOrderId=shipmentBoxId', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1', companyId: 'c1' });
    tx.channelListingOption.findUnique.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-100',
      orderId: 'CO-200',
      status: 'ACCEPT',
      orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'Toy', shippingCount: 2, salesPrice: 1000, orderPrice: 2000 }],
      shippingPrice: 0,
      totalPrice: 2000,
      orderer: { name: 'Alice' },
      receiver: { name: 'Bob', addr1: 'Seoul' },
    } as any, 'c1');

    expect(prisma.$transaction).toHaveBeenCalled();
    const upsertArgs = tx.order.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({
      companyId_platform_externalOrderId: { companyId: 'c1', platform: 'coupang', externalOrderId: 'SBX-100' },
    });
    expect(upsertArgs.create.externalNumber).toBe('CO-200');
    expect(upsertArgs.create.totalPrice).toBe(2000);
    expect(upsertArgs.create.customerName).toBe('Alice');
  });

  it('vendorItemId match → optionId denormalized on OrderLineItem', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findUnique.mockResolvedValue({
      id: 'lo-1',
      optionId: 'opt-1',
      option: { sku: 'SKU-1', optionName: 'Red' },
    });
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'Toy', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, 'c1');

    const liArgs = tx.orderLineItem.upsert.mock.calls[0][0];
    expect(liArgs.create.optionId).toBe('opt-1');
    expect(liArgs.create.listingOptionId).toBe('lo-1');
    expect(liArgs.create.sku).toBe('SKU-1');
  });

  it('vendorItemId no match → optionId null', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findUnique.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'UNKNOWN', sellerProductName: 'Mystery', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, 'c1');

    const liArgs = tx.orderLineItem.upsert.mock.calls[0][0];
    expect(liArgs.create.optionId).toBeNull();
    expect(liArgs.create.listingOptionId).toBeNull();
    expect(liArgs.create.sku).toBeNull();
  });

  it('totalPrice computed from sum(orderItems.orderPrice)', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findUnique.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [
        { vendorItemId: 'V1', sellerProductName: 'A', shippingCount: 1, salesPrice: 100, orderPrice: 100 },
        { vendorItemId: 'V2', sellerProductName: 'B', shippingCount: 1, salesPrice: 200, orderPrice: 200 },
      ],
    } as any, 'c1');

    const upsertArgs = tx.order.upsert.mock.calls[0][0];
    expect(upsertArgs.create.totalPrice).toBe(300);
  });
});
