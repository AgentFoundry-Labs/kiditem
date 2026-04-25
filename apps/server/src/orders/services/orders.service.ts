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
    const shipmentBoxId = /^\d+$/.test(order.externalOrderId) ? Number(order.externalOrderId) : null;
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

  async confirm(shipmentBoxIds: number[]): Promise<OrderActionResponse> {
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
  ): Promise<OrderActionResponse> {
    const result = await uploadInvoice(shipmentBoxId, {
      deliveryCompanyCode,
      invoiceNumber,
    });
    return { message: '송장 전송 완료', data: result } satisfies OrderActionResponse;
  }
}
