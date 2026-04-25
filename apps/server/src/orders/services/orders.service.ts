import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  confirmOrderSheets,
  uploadInvoice,
  DELIVERY_COMPANIES,
} from '../../channels/adapters/coupang/orders';
import { OrderStatusSchema } from '@kiditem/shared';
import type {
  OrderActionResponse,
  OrderListItem,
  OrderListResponse,
  OrderStatsResponse,
} from '@kiditem/shared';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private toListItem(order: {
    id: string;
    platform: string;
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
    const status = OrderStatusSchema.parse(order.status);

    return {
      id: order.id,
      platform: order.platform,
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
    companyId: string,
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

    const orders = await this.prisma.order.findMany({
      where: {
        companyId,
        status: dbStatus,
        ...(Object.keys(orderedAtFilter).length > 0 && {
          orderedAt: orderedAtFilter,
        }),
      },
      include: {
        lineItems: {
          where: { companyId },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { orderedAt: 'desc' },
    });

    return {
      items: orders.map((order) => this.toListItem(order)),
      total: orders.length,
      deliveryCompanies: [...DELIVERY_COMPANIES],
    } satisfies OrderListResponse;
  }

  async findOne(id: string, companyId: string) {
    // ADR-0006: findUnique({ where: { id } }) 금지 — companyId 필수
    const order = await this.prisma.order.findFirst({
      where: { id, companyId },
      include: {
        lineItems: {
          where: { companyId },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getStats(companyId: string): Promise<OrderStatsResponse> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay();
    const weekStart = new Date(todayStart.getTime() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 86400000);

    const [total, accept, instruct, departure, delivering, finalDelivery, todayAgg, weekAgg] =
      await Promise.all([
        this.prisma.order.count({ where: { companyId } }),
        this.prisma.order.count({ where: { companyId, status: 'ACCEPT' } }),
        this.prisma.order.count({ where: { companyId, status: 'INSTRUCT' } }),
        this.prisma.order.count({ where: { companyId, status: 'DEPARTURE' } }),
        this.prisma.order.count({ where: { companyId, status: 'DELIVERING' } }),
        this.prisma.order.count({ where: { companyId, status: 'FINAL_DELIVERY' } }),
        this.prisma.order.aggregate({
          where: { companyId, orderedAt: { gte: todayStart } },
          _count: true,
          _sum: { totalPrice: true },
        }),
        this.prisma.order.aggregate({
          where: { companyId, orderedAt: { gte: weekStart } },
          _count: true,
          _sum: { totalPrice: true },
        }),
      ]);

    return {
      stats: { total, accept, instruct, departure, delivering, finalDelivery },
      today: {
        orders: todayAgg._count,
        revenue: todayAgg._sum.totalPrice ?? 0,
      },
      week: {
        orders: weekAgg._count,
        revenue: weekAgg._sum.totalPrice ?? 0,
      },
    } satisfies OrderStatsResponse;
  }

  /**
   * shipmentBoxId 소유권 검증 — 주어진 ID 들이 모두 companyId 의 Coupang 주문이어야
   * 외부 API 호출. 한 건이라도 누락되면 NotFoundException (IDOR 방어).
   */
  private async assertOwnedShipmentBoxIds(
    shipmentBoxIds: number[],
    companyId: string,
  ): Promise<void> {
    const externalOrderIds = shipmentBoxIds.map((id) => String(id));
    const owned = await this.prisma.order.findMany({
      where: {
        companyId,
        platform: 'coupang',
        externalOrderId: { in: externalOrderIds },
      },
      select: { externalOrderId: true },
    });
    if (owned.length !== shipmentBoxIds.length) {
      const ownedSet = new Set(owned.map((o) => o.externalOrderId));
      const missing = externalOrderIds.filter((id) => !ownedSet.has(id));
      throw new NotFoundException(
        `Order(s) not found for company: ${missing.join(', ')}`,
      );
    }
  }

  async confirm(
    shipmentBoxIds: number[],
    companyId: string,
  ): Promise<OrderActionResponse> {
    await this.assertOwnedShipmentBoxIds(shipmentBoxIds, companyId);
    const result = await confirmOrderSheets(shipmentBoxIds);
    return {
      message: `${shipmentBoxIds.length}건 승인 완료`,
      data: result,
    } satisfies OrderActionResponse;
  }

  async uploadInvoice(
    shipmentBoxId: number,
    deliveryCompanyCode: string,
    invoiceNumber: string,
    companyId: string,
  ): Promise<OrderActionResponse> {
    await this.assertOwnedShipmentBoxIds([shipmentBoxId], companyId);
    const result = await uploadInvoice(shipmentBoxId, {
      deliveryCompanyCode,
      invoiceNumber,
    });
    return { message: '송장 전송 완료', data: result } satisfies OrderActionResponse;
  }
}
