import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, NotImplementedException } from '@nestjs/common';
import { OrderListResponseSchema, OrderStatsResponseSchema } from '@kiditem/shared/order';
import { OrdersService } from '../orders.service';

function makePrisma() {
  const prisma = {
    order: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    // 실행으로 옮긴 몰의 확인 범위(KID-359) — 이 스펙은 옛 run만 쓴다.
    operation: { findMany: vi.fn().mockResolvedValue([]) },
    sourceImportRun: {
      findMany: vi.fn().mockResolvedValue([{
        sourceType: 'order_collection_mall',
        channelAccountId: '00000000-0000-4000-8000-000000000099',
        importedAt: new Date('2026-05-01T01:00:00.000Z'),
        updatedAt: new Date('2026-05-01T01:00:00.000Z'),
        createdAt: new Date('2026-05-01T01:00:00.000Z'),
        coverageStartDate: new Date('2000-01-01T00:00:00.000Z'),
        coverageEndDate: new Date('3000-01-01T00:00:00.000Z'),
        channelAccount: {
          channel: 'haebub-mall',
          externalAccountId: 'haebub-mall',
        },
        orders: [],
      }]),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  return prisma;
}

const ORGANIZATION_ID = 'organization-1';
const OTHER_ORGANIZATION_ID = 'organization-2';
const CHANNEL_ACCOUNT_ID = '00000000-0000-4000-8000-000000000010';

const MOCK_LINE_ITEM = {
  id: '00000000-0000-4000-8000-000000000002',
  productName: '키즈 티셔츠',
  optionName: '120 / Blue',
  sku: 'SKU-001',
  quantity: 2,
  unitPrice: 17500,
  totalPrice: 35000,
  status: 'ACCEPT',
  externalLineId: '98765',
};

const MOCK_ORDER = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'ACCEPT',
  orderedAt: new Date('2026-01-15T01:00:00.000Z'),
  shippedAt: null,
  deliveredAt: null,
  totalPrice: 35000,
  organizationId: ORGANIZATION_ID,
  channelAccountId: CHANNEL_ACCOUNT_ID,
  channelAccount: { channel: 'coupang' },
  platform: 'coupang',
  externalOrderId: '12345',
  externalNumber: 'CO-1',
  customerName: '홍길동',
  receiverName: '홍길동',
  receiverAddr: '서울시 중구',
  memo: null,
  trackingNumber: null,
  shippingCompany: null,
  lineItems: [MOCK_LINE_ITEM],
};

describe('OrdersService — order query and actions', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof makePrisma>;
  const accounts = {
    findByIds: vi.fn(async (_transaction: unknown, input: { accountIds: readonly string[] }) =>
      input.accountIds.map((id) => ({
        id,
        name: 'test account',
        channel: id === CHANNEL_ACCOUNT_ID ? 'coupang' : 'haebub-mall',
        status: 'active',
      })),
    ),
  };

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(prisma as any, accounts as any);
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('findAll with status filter → organizationId + status 필터 둘 다 적용', async () => {
      prisma.order.findMany.mockResolvedValue([MOCK_ORDER]);

      const result = await service.findAll(ORGANIZATION_ID, { status: 'ACCEPT' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORGANIZATION_ID, status: 'ACCEPT' }),
        }),
      );
      expect(result.total).toBe(1);

      // Derived list item shape assertions
      expect(result.items[0]).toEqual(expect.objectContaining({
        displayOrderNumber: 'CO-1',
        shipmentBoxId: 12345,
        primaryProductName: '키즈 티셔츠',
        totalQuantity: 2,
        lineItemCount: 1,
      }));
      expect(result.items[0]?.lineItems[0]?.sku).toBe('SKU-001');

      // OrderListResponseSchema JSON-roundtrip parse (simulates HTTP serialisation)
      const parsed = OrderListResponseSchema.safeParse(JSON.parse(JSON.stringify(result)));
      expect(parsed.success).toBe(true);
    });

    it('findAll with no filter → defaults to ACCEPT + organizationId 적용', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll(ORGANIZATION_ID, {});

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORGANIZATION_ID, status: 'ACCEPT' }),
        }),
      );
    });

    it('findAll with date range → organizationId + orderedAt 필터 적용', async () => {
      prisma.order.findMany.mockResolvedValue([MOCK_ORDER]);

      await service.findAll(ORGANIZATION_ID, { from: '2026-01-01', to: '2026-01-31' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORGANIZATION_ID,
            orderedAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('findAll lineItems include scoped by organizationId (IDOR regression)', async () => {
      // Prisma filters line items to organizationId at DB level; we verify the include clause
      // contains `where: { organizationId }` — the Prisma mock simulates that only the
      // in-organization line item is returned (other-organization item excluded by DB filter).
      const inCompanyItem = { ...MOCK_LINE_ITEM, id: '00000000-0000-4000-8000-000000000002' };
      const orderWithFilteredItems = { ...MOCK_ORDER, lineItems: [inCompanyItem] };
      prisma.order.findMany.mockResolvedValue([orderWithFilteredItems]);

      const result = await service.findAll(ORGANIZATION_ID, {});

      // Verify include contains organizationId where clause (IDOR guard)
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            lineItems: expect.objectContaining({
              where: expect.objectContaining({ organizationId: ORGANIZATION_ID }),
            }),
          }),
        }),
      );

      // Only the in-organization line item appears in the mapped response
      expect(result.items[0]?.lineItems).toHaveLength(1);
      expect(result.items[0]?.lineItems[0]?.id).toBe(inCompanyItem.id);

      // Confirm the other-organization item is absent (it would not be returned by Prisma)
      const allLineItemIds = result.items.flatMap((item) => item.lineItems.map((li) => li.id));
      expect(allLineItemIds).not.toContain(OTHER_ORGANIZATION_ID);
    });

    it('shipmentBoxId is numeric when externalOrderId is digits, null otherwise', async () => {
      const numericOrder = { ...MOCK_ORDER, externalOrderId: '99999', externalNumber: null, lineItems: [MOCK_LINE_ITEM] };
      const alphaOrder = { ...MOCK_ORDER, id: 'order-2', externalOrderId: 'ALPHA-123', externalNumber: null, lineItems: [MOCK_LINE_ITEM] };
      prisma.order.findMany.mockResolvedValue([numericOrder, alphaOrder]);

      const result = await service.findAll(ORGANIZATION_ID, {});

      expect(result.items[0]?.shipmentBoxId).toBe(99999);
      expect(result.items[1]?.shipmentBoxId).toBeNull();
    });

    it('legacy NONE_TRACKING row → toListItem 에서 DEPARTURE 로 정규화 (regression)', async () => {
      const noneTrackingOrder = {
        ...MOCK_ORDER,
        id: '00000000-0000-4000-8000-0000000000aa',
        status: 'NONE_TRACKING',
        lineItems: [MOCK_LINE_ITEM],
      };
      prisma.order.findMany.mockResolvedValue([noneTrackingOrder]);

      const result = await service.findAll(ORGANIZATION_ID, { status: 'NONE_TRACKING' });

      // OrderStatusSchema 는 NONE_TRACKING 을 받지만, toListItem 이 pipeline 호환을 위해 DEPARTURE 로 정규화
      expect(result.items[0]?.status).toBe('DEPARTURE');
      // shared schema round-trip 통과
      const parsed = OrderListResponseSchema.safeParse(JSON.parse(JSON.stringify(result)));
      expect(parsed.success).toBe(true);
    });

    it('?status=DEPARTURE 가 legacy raw NONE_TRACKING row 까지 fetch + 응답에서 DEPARTURE 로 일원화 (regression)', async () => {
      const departureOrder = {
        ...MOCK_ORDER,
        id: '00000000-0000-4000-8000-0000000000bb',
        externalOrderId: '11111',
        status: 'DEPARTURE',
        lineItems: [MOCK_LINE_ITEM],
      };
      const legacyNoneTrackingOrder = {
        ...MOCK_ORDER,
        id: '00000000-0000-4000-8000-0000000000cc',
        externalOrderId: '22222',
        status: 'NONE_TRACKING',
        lineItems: [MOCK_LINE_ITEM],
      };
      prisma.order.findMany.mockResolvedValue([departureOrder, legacyNoneTrackingOrder]);

      const result = await service.findAll(ORGANIZATION_ID, { status: 'DEPARTURE' });

      // DEPARTURE 요청 시 legacy NONE_TRACKING 까지 함께 조회
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORGANIZATION_ID,
            status: { in: ['DEPARTURE', 'NONE_TRACKING'] },
          }),
        }),
      );
      // 응답 status 는 두 row 모두 DEPARTURE 로 정규화됨
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.status).toBe('DEPARTURE');
      expect(result.items[1]?.status).toBe('DEPARTURE');
    });

    it('?status=ACCEPT 등 비-DEPARTURE 요청은 단일 equality 유지', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll(ORGANIZATION_ID, { status: 'ACCEPT' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORGANIZATION_ID,
            status: 'ACCEPT',
          }),
        }),
      );
    });

    it('shipmentBoxId 가 Number.MAX_SAFE_INTEGER 를 넘으면 null (regression — unsafe ID action 차단)', async () => {
      // externalOrderId 는 string 이지만 Number 캐스팅 시 안전 범위를 벗어나는 케이스
      const unsafeStr = String(BigInt(Number.MAX_SAFE_INTEGER) + 7n);
      const unsafeOrder = {
        ...MOCK_ORDER,
        id: '00000000-0000-4000-8000-000000000099',
        externalOrderId: unsafeStr,
        externalNumber: null,
        lineItems: [MOCK_LINE_ITEM],
      };
      prisma.order.findMany.mockResolvedValue([unsafeOrder]);

      const result = await service.findAll(ORGANIZATION_ID, {});

      expect(result.items[0]?.shipmentBoxId).toBeNull();
      // shared schema 도 unsafe 값을 거부하므로 응답 전체가 round-trip parse 통과해야 함
      const parsed = OrderListResponseSchema.safeParse(JSON.parse(JSON.stringify(result)));
      expect(parsed.success).toBe(true);
    });
  });

  describe('findOne', () => {
    it('findOne → organizationId 필터와 함께 findFirst 사용 (IDOR 방어)', async () => {
      prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);

      const result = await service.findOne('order-1', ORGANIZATION_ID);

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'order-1', organizationId: ORGANIZATION_ID }),
          include: expect.objectContaining({
            lineItems: expect.objectContaining({
              where: expect.objectContaining({ organizationId: ORGANIZATION_ID }),
            }),
          }),
        }),
      );
      expect(result).toEqual(MOCK_ORDER);
    });

    it('다른 회사의 주문 접근 시 NotFoundException (IDOR 방어)', async () => {
      // order-1 은 다른 회사 소유 → organization-1 입장에서는 not found
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.findOne('order-1', ORGANIZATION_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'order-1', organizationId: ORGANIZATION_ID }),
        }),
      );
    });
  });

  describe('confirm', () => {
    it('confirm action is explicitly unsupported before database/provider access', async () => {
      await expect(service.confirm([12345], ORGANIZATION_ID)).rejects.toBeInstanceOf(
        NotImplementedException,
      );
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });
  });

  describe('uploadInvoice', () => {
    it('invoice action is explicitly unsupported before database/provider access', async () => {
      await expect(
        service.uploadInvoice(12345, 'CJGLS', 'INV-001', ORGANIZATION_ID),
      ).rejects.toBeInstanceOf(NotImplementedException);
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('getStats maps canonical status and line-amount window facts', async () => {
      prisma.order.groupBy.mockResolvedValue([
        { status: 'ACCEPT', _count: 50 },
        { status: 'INSTRUCT', _count: 20 },
        { status: 'DEPARTURE', _count: 10 },
        { status: 'DELIVERING', _count: 15 },
        { status: 'FINAL_DELIVERY', _count: 5 },
      ]);
      prisma.$queryRaw
        .mockResolvedValueOnce([{
          revenue: 90_000n,
          orderCount: 3n,
          quantity: 4n,
          factObservedAt: new Date('2026-05-01T01:00:00.000Z'),
        }])
        .mockResolvedValueOnce([{
          revenue: 300_000n,
          orderCount: 10n,
          quantity: 12n,
          factObservedAt: new Date('2026-05-01T01:00:00.000Z'),
        }]);

      const result = await service.getStats(ORGANIZATION_ID);

      expect(result.stats.total).toBe(100);
      expect(result.stats.accept).toBe(50);
      expect(result.stats.instruct).toBe(20);
      expect(result.today.orders).toBe(3);
      expect(result.today.revenue).toBe(90000);
      expect(result.today.missingDates).toEqual([]);
      expect(result.week.orders).toBe(10);
      expect(prisma.order.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORGANIZATION_ID }),
        }),
      );
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

      // OrderStatsResponse shape
      const parsed = OrderStatsResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('keeps Today and week totals null when the owner has not covered the whole window', async () => {
      prisma.sourceImportRun.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([
        {
          revenue: 90_000n,
          orderCount: 3n,
          quantity: 4n,
          factObservedAt: new Date('2026-05-01T01:00:00.000Z'),
        },
      ]);

      const result = await service.getStats(ORGANIZATION_ID);

      expect(result.today.orders).toBeNull();
      expect(result.today.revenue).toBeNull();
      expect(result.today.includedDates).toEqual([]);
      expect(result.today.missingDates).toHaveLength(1);
      expect(result.week.orders).toBeNull();
      expect(OrderStatsResponseSchema.safeParse(result).success).toBe(true);
    });
  });
});
