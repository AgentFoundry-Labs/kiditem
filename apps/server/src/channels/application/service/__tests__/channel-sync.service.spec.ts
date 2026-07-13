import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChannelSyncService, formatKstIso, normalizeCoupangOrderStatus } from '../channel-sync.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangProviderPort,
} from '../../port/out/provider/coupang-provider.port';
import { CHANNEL_SYNC_REPOSITORY_PORT } from '../../port/out/repository/channel-sync.repository.port';
import { ChannelSyncRepositoryAdapter } from '../../../adapter/out/repository/channel-sync.repository.adapter';
import { ChannelAccountService } from '../channel-account.service';

function makeCoupangPortStub(): CoupangProviderPort {
  return {
    getDeliveryCompanies: vi.fn(() => []),
    getSellerProducts: vi.fn(),
    getSellerProduct: vi.fn(),
    getOrderSheets: vi.fn(),
    confirmOrderSheets: vi.fn(),
    uploadInvoice: vi.fn(),
    approveReturn: vi.fn(),
  };
}

function makeChannelAccountStub() {
  return {
    getCoupangSettings: vi.fn().mockResolvedValue({
      configured: true,
      vendorId: 'TEST_VENDOR',
      accessKeyMasked: 'TEST********KEY',
      hasAccessKey: true,
      hasSecretKey: true,
      status: 'active',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  };
}

describe('ChannelSyncService.syncSingleOrder (Plan A.5)', () => {
  let service: ChannelSyncService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      orderLineItem: { upsert: vi.fn(), findFirst: vi.fn() },
      channelListingOption: { findFirst: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (cb: any) => cb(tx)),
      channelAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'account-1' }) },
    };
    const coupangPortStub = makeCoupangPortStub();
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: CHANNEL_SYNC_REPOSITORY_PORT, useValue: new ChannelSyncRepositoryAdapter(prisma as never) },
        { provide: ChannelAccountService, useValue: makeChannelAccountStub() },
        { provide: COUPANG_PROVIDER_PORT, useValue: coupangPortStub },
      ],
    }).compile();
    service = m.get(ChannelSyncService);
  });

  it('upserts Order with platform=coupang + externalOrderId=shipmentBoxId', async () => {
    tx.order.create.mockResolvedValue({ id: 'order-1', organizationId: 'c1' });
    tx.channelListingOption.findFirst.mockResolvedValue(null);
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
    expect(tx.order.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'c1',
        channelAccountId: 'account-1',
        externalOrderId: 'SBX-100',
      },
      select: { id: true },
    });
    const createArgs = tx.order.create.mock.calls[0][0];
    expect(createArgs.data.channelAccountId).toBe('account-1');
    expect(createArgs.data.externalNumber).toBe('CO-200');
    expect(createArgs.data.totalPrice).toBe(2000);
    expect(createArgs.data.customerName).toBe('Alice');
  });

  it('payload.status=NONE_TRACKING → DB 에는 DEPARTURE 로 정규화 (regression)', async () => {
    tx.order.create.mockResolvedValue({ id: 'order-nt' });
    tx.channelListingOption.findFirst.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-NT', orderId: 'CO-NT',
      status: 'NONE_TRACKING',
      orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'Toy', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, 'c1');

    expect(tx.order.create.mock.calls[0][0].data.status).toBe('DEPARTURE');
  });

  it('vendorItemId match links the account-scoped listing option without ProductOption ownership', async () => {
    tx.order.create.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findFirst.mockResolvedValue({
      id: 'lo-1',
      sellerSku: 'SKU-1',
      itemName: 'Red',
    });
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'Toy', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, 'c1');

    const liArgs = tx.orderLineItem.upsert.mock.calls[0][0];
    expect(liArgs.create).not.toHaveProperty('optionId');
    expect(liArgs.create.listingOptionId).toBe('lo-1');
    expect(liArgs.create.sku).toBe('SKU-1');
  });

  it('vendorItemId no match → optionId null', async () => {
    tx.order.create.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findFirst.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'UNKNOWN', sellerProductName: 'Mystery', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, 'c1');

    const liArgs = tx.orderLineItem.upsert.mock.calls[0][0];
    expect(liArgs.create).not.toHaveProperty('optionId');
    expect(liArgs.create.listingOptionId).toBeNull();
    expect(liArgs.create.sku).toBe('UNKNOWN');
  });

  it('totalPrice computed from sum(orderItems.orderPrice)', async () => {
    tx.order.create.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findFirst.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [
        { vendorItemId: 'V1', sellerProductName: 'A', shippingCount: 1, salesPrice: 100, orderPrice: 100 },
        { vendorItemId: 'V2', sellerProductName: 'B', shippingCount: 1, salesPrice: 200, orderPrice: 200 },
      ],
    } as any, 'c1');

    expect(tx.order.create.mock.calls[0][0].data.totalPrice).toBe(300);
  });

  it('null vendorItemId → BadRequestException (계약 명시화, upsert key 충돌 방지)', async () => {
    tx.order.create.mockResolvedValue({ id: 'order-1' });

    await expect(
      (service as any).syncSingleOrder({
        shipmentBoxId: 'SBX-77', orderId: 'CO-77', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
        orderItems: [
          { vendorItemId: null, sellerProductName: 'A', shippingCount: 1, salesPrice: 100, orderPrice: 100 },
        ],
      } as any, 'c1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.channelListingOption.findFirst).not.toHaveBeenCalled();
    expect(tx.orderLineItem.upsert).not.toHaveBeenCalled();
  });

  it('paidAt 누락 → create.paidAt = null', async () => {
    tx.order.create.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findFirst.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await (service as any).syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      // paidAt 생략
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'A', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, 'c1');

    expect(tx.order.create.mock.calls[0][0].data.paidAt).toBeNull();
  });

  it('orderLineItem upsert 실패 시 transaction 전체 rollback (callback throw 전파)', async () => {
    tx.order.create.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findFirst.mockResolvedValue(null);
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
      orderReturn: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      orderReturnLineItem: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
      },
      orderLineItem: { findFirst: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (cb: any) => cb(tx)),
      channelAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'account-1' }) },
    };
    const coupangPortStub = makeCoupangPortStub();
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: CHANNEL_SYNC_REPOSITORY_PORT, useValue: new ChannelSyncRepositoryAdapter(prisma as never) },
        { provide: ChannelAccountService, useValue: makeChannelAccountStub() },
        { provide: COUPANG_PROVIDER_PORT, useValue: coupangPortStub },
      ],
    }).compile();
    service = m.get(ChannelSyncService);
  });

  it('upserts OrderReturn with type from receiptType', async () => {
    tx.order.findFirst.mockResolvedValue({ id: 'order-1' });
    tx.orderReturn.create.mockResolvedValue({ id: 'ret-1' });

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

    expect(tx.orderReturn.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'c1',
        channelAccountId: 'account-1',
        externalReturnId: 'RCT-1',
      },
      select: { id: true },
    });
    const args = tx.orderReturn.create.mock.calls[0][0].data;
    expect(args.channelAccountId).toBe('account-1');
    expect(args.type).toBe('RETURN');
    expect(args.requesterName).toBe('Alice');
    expect(args.orderId).toBe('order-1');
  });

  it('items JSON → OrderReturnLineItem rows', async () => {
    tx.order.findFirst.mockResolvedValue(null);
    tx.orderReturn.create.mockResolvedValue({ id: 'ret-1' });
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
    expect(firstCreate.organizationId).toBe('c1');
    expect(firstCreate.productName).toBe('Toy');
  });

  it('items 빈 배열 → deleteMany 만 호출, create 0회', async () => {
    tx.order.findFirst.mockResolvedValue(null);
    tx.orderReturn.create.mockResolvedValue({ id: 'ret-1' });

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

describe('formatKstIso (KR market timestamp regression)', () => {
  it('KST 09:30 (UTC 00:30) → 2026-04-25T09:30:00+09:00', () => {
    const utcInstant = new Date('2026-04-25T00:30:00.000Z');
    expect(formatKstIso(utcInstant)).toBe('2026-04-25T09:30:00+09:00');
  });

  it('KST midnight (UTC previous-day 15:00) → start-of-day +09:00', () => {
    const utcInstant = new Date('2026-04-24T15:00:00.000Z');
    expect(formatKstIso(utcInstant)).toBe('2026-04-25T00:00:00+09:00');
  });

  it('zero-pads single-digit components', () => {
    const utcInstant = new Date('2026-01-04T23:01:02.000Z'); // KST 2026-01-05 08:01:02
    expect(formatKstIso(utcInstant)).toBe('2026-01-05T08:01:02+09:00');
  });
});

describe('normalizeCoupangOrderStatus (NONE_TRACKING regression)', () => {
  it('NONE_TRACKING → DEPARTURE (송장없는 배송 = 출고완료 의미)', () => {
    expect(normalizeCoupangOrderStatus('NONE_TRACKING')).toBe('DEPARTURE');
  });

  it('canonical statuses 통과', () => {
    expect(normalizeCoupangOrderStatus('ACCEPT')).toBe('ACCEPT');
    expect(normalizeCoupangOrderStatus('DEPARTURE')).toBe('DEPARTURE');
    expect(normalizeCoupangOrderStatus('FINAL_DELIVERY')).toBe('FINAL_DELIVERY');
  });

  it('null/undefined → undefined (upsert update branch 호환)', () => {
    expect(normalizeCoupangOrderStatus(null)).toBeUndefined();
    expect(normalizeCoupangOrderStatus(undefined)).toBeUndefined();
  });
});

describe('ChannelSyncService.syncOrders (KST adapter boundary)', () => {
  let service: ChannelSyncService;
  let prisma: any;
  let coupangPortStub: CoupangProviderPort;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = {
      $transaction: vi.fn(),
      channelAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'account-1' }) },
    };
    coupangPortStub = makeCoupangPortStub();
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: CHANNEL_SYNC_REPOSITORY_PORT, useValue: new ChannelSyncRepositoryAdapter(prisma as never) },
        { provide: ChannelAccountService, useValue: makeChannelAccountStub() },
        { provide: COUPANG_PROVIDER_PORT, useValue: coupangPortStub },
      ],
    }).compile();
    service = m.get(ChannelSyncService);
  });

  it('Coupang adapter receives `+09:00` KST timestamps (regression — KST 09:30 → 09:30)', async () => {
    (coupangPortStub.getOrderSheets as ReturnType<typeof vi.fn>).mockResolvedValue({ code: 'SUCCESS', data: [] });

    // KST 2026-04-25 09:30 = UTC 2026-04-25T00:30:00Z
    const dateTo = new Date('2026-04-25T00:30:00.000Z');
    const dateFrom = new Date('2026-04-18T00:00:00.000Z'); // KST 09:00 같은 날

    await service.syncOrders('c1', dateFrom, dateTo);

    expect(coupangPortStub.getOrderSheets).toHaveBeenCalledWith(
      'c1',
      'account-1',
      expect.objectContaining({
        createdAtFrom: '2026-04-18T09:00:00+09:00',
        createdAtTo: '2026-04-25T09:30:00+09:00',
      }),
    );
  });
});
