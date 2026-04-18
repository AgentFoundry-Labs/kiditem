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

  it('null vendorItemId → 결정적 합성 externalLineId 사용 (idempotent)', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findUnique.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-77', orderId: 'CO-77', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [
        { vendorItemId: null, sellerProductName: 'A', shippingCount: 1, salesPrice: 100, orderPrice: 100 },
        { vendorItemId: null, sellerProductName: 'B', shippingCount: 1, salesPrice: 200, orderPrice: 200 },
      ],
    } as any, 'c1');

    expect(tx.orderLineItem.upsert).toHaveBeenCalledTimes(2);
    const first = tx.orderLineItem.upsert.mock.calls[0][0];
    const second = tx.orderLineItem.upsert.mock.calls[1][0];
    expect(first.where.orderId_externalLineId.externalLineId).toBe('coupang-noid-SBX-77-0');
    expect(second.where.orderId_externalLineId.externalLineId).toBe('coupang-noid-SBX-77-1');
    expect(first.create.externalLineId).toBe('coupang-noid-SBX-77-0');
    expect(second.create.externalLineId).toBe('coupang-noid-SBX-77-1');
    // ChannelListingOption 조회는 vendorItemId 없으면 skip
    expect(tx.channelListingOption.findUnique).not.toHaveBeenCalled();
  });

  it('paidAt 누락 → create.paidAt = null', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findUnique.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      // paidAt 생략
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'A', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, 'c1');

    const args = tx.order.upsert.mock.calls[0][0];
    expect(args.create.paidAt).toBeNull();
  });

  it('orderLineItem upsert 실패 시 transaction 전체 rollback (callback throw 전파)', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findUnique.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockRejectedValue(new Error('FK violation'));

    await expect(
      (service as any).syncSingleOrder({
        shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
        orderItems: [{ vendorItemId: 'V1', sellerProductName: 'A', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
      } as any, 'c1'),
    ).rejects.toThrow('FK violation');

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('ChannelSyncService.syncSingleReturn (Plan A.5)', () => {
  let service: ChannelSyncService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      order: { findFirst: vi.fn() },
      orderReturn: { upsert: vi.fn() },
      orderReturnLineItem: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
      },
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

  it('upserts OrderReturn with type from receiptType', async () => {
    tx.order.findFirst.mockResolvedValue({ id: 'order-1' });
    tx.orderReturn.upsert.mockResolvedValue({ id: 'ret-1' });

    await (service as any).syncSingleReturn({
      receiptId: 'RCT-1',
      receiptType: 'RETURN',
      receiptStatus: 'UC',
      orderId: 'CO-1',
      cancelReason: 'damaged',
      faultByType: 'CUSTOMER',
      requesterName: 'Alice',
      requestedAt: '2026-04-18T00:00:00Z',
      items: [],
    } as any, 'c1');

    const args = tx.orderReturn.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      companyId_platform_externalReturnId: { companyId: 'c1', platform: 'coupang', externalReturnId: 'RCT-1' },
    });
    expect(args.create.type).toBe('RETURN');
    expect(args.create.requesterName).toBe('Alice');
    expect(args.create.orderId).toBe('order-1');
  });

  it('items JSON → OrderReturnLineItem rows', async () => {
    tx.order.findFirst.mockResolvedValue(null);
    tx.orderReturn.upsert.mockResolvedValue({ id: 'ret-1' });
    tx.orderReturnLineItem.create.mockResolvedValue({});

    await (service as any).syncSingleReturn({
      receiptId: 'RCT-2',
      receiptType: 'EXCHANGE',
      receiptStatus: 'UC',
      orderId: null,
      requesterName: 'Bob',
      requestedAt: '2026-04-18T00:00:00Z',
      items: [
        { productName: 'Toy', quantity: 1 },
        { productName: 'Book', quantity: 2 },
      ],
    } as any, 'c1');

    expect(tx.orderReturnLineItem.deleteMany).toHaveBeenCalledWith({ where: { returnId: 'ret-1' } });
    expect(tx.orderReturnLineItem.create).toHaveBeenCalledTimes(2);
    const firstCreate = tx.orderReturnLineItem.create.mock.calls[0][0].data;
    expect(firstCreate.companyId).toBe('c1');
    expect(firstCreate.productName).toBe('Toy');
  });

  it('items 빈 배열 → deleteMany 만 호출, create 0회', async () => {
    tx.order.findFirst.mockResolvedValue(null);
    tx.orderReturn.upsert.mockResolvedValue({ id: 'ret-1' });

    await (service as any).syncSingleReturn({
      receiptId: 'RCT-3',
      receiptType: 'RETURN',
      receiptStatus: 'UC',
      orderId: null,
      requesterName: 'Carol',
      requestedAt: '2026-04-18T00:00:00Z',
      items: [],
    } as any, 'c1');

    expect(tx.orderReturnLineItem.deleteMany).toHaveBeenCalledWith({ where: { returnId: 'ret-1' } });
    expect(tx.orderReturnLineItem.create).not.toHaveBeenCalled();
  });
});
