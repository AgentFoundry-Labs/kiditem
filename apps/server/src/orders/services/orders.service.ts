import { Injectable, NotFoundException, BadRequestException, NotImplementedException } from '@nestjs/common';
import { OrderStatusSchema } from '@kiditem/shared/order';
import { PrismaService } from '../../prisma/prisma.service';
import {
  readOrderByIdFact,
  readOrderListFacts,
  readOrderStatusCounts,
  readOrderWindowFacts,
  type OrderWindowFacts,
} from '../read/order-facts.reader';
import type { OrderActionResponse, OrderListItem, OrderListResponse, OrderStatsResponse } from '@kiditem/shared/order';
import { addDays, kstBusinessDate, kstDayStart } from '../../common/kst';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private toListItem(order: {
    id: string;
    channelAccountId: string | null;
    channelAccount: { channel: string } | null;
    externalOrderId: string;
    externalNumber: string | null;
    customerName: string;
    receiverName: string | null;
    receiverAddr: string | null;
    memo: string | null;
    status: string;
    orderedAt: Date;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    trackingNumber: string | null;
    shippingCompany: string | null;
    totalPrice: number;
    lineItems: Array<{
      id: string;
      productName: string;
      optionName: string | null;
      sku: string | null;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      status: string;
      externalLineId: string | null;
    }>;
  }): OrderListItem {
    const primary = order.lineItems[0] ?? null;
    const totalQuantity = order.lineItems.reduce((sum, item) => sum + item.quantity, 0);
    // shipmentBoxId 는 Coupang 외부 ID. JS Number 안전 범위 (Number.MAX_SAFE_INTEGER) 를 넘으면
    // 캐스팅 시 반올림되어 다른 ID 로 action 이 나갈 수 있다 — null 로 떨어뜨려 action 대상에서 제외.
    const shipmentBoxId = (() => {
      if (!/^\d+$/.test(order.externalOrderId)) return null;
      const num = Number(order.externalOrderId);
      return Number.isSafeInteger(num) && num > 0 ? num : null;
    })();
    // Coupang `NONE_TRACKING` (송장없는 배송) 은 sync 단계에서 DEPARTURE 로 정규화되지만,
    // 기존 레거시 row 가 raw 로 남아있을 수 있어 toListItem 에서도 한 번 더 정규화한다.
    // pipeline UI 5-stage bucket (ACCEPT/INSTRUCT/DEPARTURE/DELIVERING/FINAL_DELIVERY) 와 정합.
    const normalizedRaw =
      order.status === 'NONE_TRACKING' ? 'DEPARTURE' : order.status;
    const status = OrderStatusSchema.parse(normalizedRaw);
    if (!order.channelAccountId || !order.channelAccount) {
      throw new BadRequestException('Order is missing its ChannelAccount owner');
    }

    return {
      id: order.id,
      channelAccountId: order.channelAccountId,
      channel: order.channelAccount?.channel ?? 'unknown',
      externalOrderId: order.externalOrderId,
      externalNumber: order.externalNumber,
      displayOrderNumber: order.externalNumber ?? order.externalOrderId,
      shipmentBoxId,
      status,
      customerName: order.customerName,
      receiverName: order.receiverName,
      receiverAddr: order.receiverAddr,
      memo: order.memo,
      orderedAt: order.orderedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      trackingNumber: order.trackingNumber,
      shippingCompany: order.shippingCompany,
      totalPrice: order.totalPrice,
      totalQuantity,
      lineItemCount: order.lineItems.length,
      primaryProductName: primary?.productName ?? null,
      primaryOptionName: primary?.optionName ?? null,
      lineItems: order.lineItems.map((item) => ({
        id: item.id,
        productName: item.productName,
        optionName: item.optionName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        status: item.status,
        externalLineId: item.externalLineId,
      })),
    } satisfies OrderListItem;
  }

  async findAll(
    organizationId: string,
    query: { from?: string; to?: string; status?: string; page?: string | number; limit?: string | number },
  ): Promise<OrderListResponse> {
    const dbStatus = query.status || 'ACCEPT';

    const orderedAtFilter: Record<string, Date> = {};
    if (query.from) orderedAtFilter.gte = new Date(query.from);
    if (query.to) {
      const toDate = new Date(query.to);
      toDate.setHours(23, 59, 59, 999);
      orderedAtFilter.lte = toDate;
    }

    // 신규 sync 는 NONE_TRACKING → DEPARTURE 로 정규화하지만, 정규화 도입 이전에 저장된
    // legacy row 는 raw NONE_TRACKING 그대로 남아있다. pipeline 의 DEPARTURE 탭이
    // legacy row 까지 노출하도록 조회 단계에서도 두 status 를 함께 받는다 (toListItem 가
    // response 시점에 다시 DEPARTURE 로 일원화).
    const statusFilter =
      dbStatus === 'DEPARTURE'
        ? { in: ['DEPARTURE', 'NONE_TRACKING'] }
        : dbStatus;

    const orders = await this.prisma.$transaction((tx) =>
      readOrderListFacts(tx, {
        organizationId,
        status: statusFilter,
        from: orderedAtFilter.gte,
        to: orderedAtFilter.lte,
      }),
    );

    return {
      items: orders.map((order) => this.toListItem(order)),
      total: orders.length,
    } satisfies OrderListResponse;
  }

  async findOne(id: string, organizationId: string) {
    // findUnique({ where: { id } }) 금지 — organizationId 필수
    const order = await this.prisma.$transaction((tx) =>
      readOrderByIdFact(tx, organizationId, id),
    );
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getStats(organizationId: string): Promise<OrderStatsResponse> {
    const now = new Date();
    const todayStart = kstDayStart(now);
    const tomorrowStart = addDays(todayStart, 1);
    const dayOfWeek = kstBusinessDate(now).getUTCDay();
    const weekStart = addDays(todayStart, -(dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const { statuses, today, week } = await this.prisma.$transaction(async (tx) => ({
      statuses: await readOrderStatusCounts(tx, organizationId),
      today: await readOrderWindowFacts(tx, {
        organizationId,
        from: todayStart,
        to: tomorrowStart,
      }),
      week: await readOrderWindowFacts(tx, {
        organizationId,
        from: weekStart,
        to: tomorrowStart,
      }),
    }));

    return {
      stats: {
        total: statuses.total,
        accept: statuses.byStatus.ACCEPT ?? 0,
        instruct: statuses.byStatus.INSTRUCT ?? 0,
        departure: statuses.byStatus.DEPARTURE ?? 0,
        delivering: statuses.byStatus.DELIVERING ?? 0,
        finalDelivery: statuses.byStatus.FINAL_DELIVERY ?? 0,
      },
      today: toOrderStatsWindow(today),
      week: toOrderStatsWindow(week),
    } satisfies OrderStatsResponse;
  }

  async confirm(
    _shipmentBoxIds: number[],
    _organizationId: string,
  ): Promise<OrderActionResponse> {
    throw new NotImplementedException('쿠팡 주문 확인은 지원하지 않습니다. 쿠팡 Wing에서 처리해 주세요.');
  }

  async uploadInvoice(
    _shipmentBoxId: number,
    _deliveryCompanyCode: string,
    _invoiceNumber: string,
    _organizationId: string,
  ): Promise<OrderActionResponse> {
    throw new NotImplementedException('쿠팡 송장 전송은 지원하지 않습니다. 쿠팡 Wing에서 처리해 주세요.');
  }
}

function toOrderStatsWindow(facts: OrderWindowFacts): OrderStatsResponse['today'] {
  const basis = {
    scope: 'KNOWN_SOURCES' as const,
    requestedDates: facts.requestedDates,
    includedDates: facts.includedDates,
    missingDates: facts.missingDates,
    sourceCoverage: facts.sourceCoverage.map(toOrderStatsSourceCoverage),
  };
  if (facts.orderCount === null || facts.revenue === null) {
    return { ...basis, orders: null, revenue: null };
  }
  return { ...basis, orders: facts.orderCount, revenue: facts.revenue };
}

function toOrderStatsSourceCoverage(source: {
  sourceType: string;
  channelAccountId: string | null;
  mallKey: string | null;
  factDates: string[];
  includedDates: string[];
  missingDates: string[];
}) {
  return {
    sourceType: source.sourceType,
    channelAccountId: source.channelAccountId,
    mallKey: source.mallKey,
    factDates: source.factDates,
    includedDates: source.includedDates,
    missingDates: source.missingDates,
  };
}
