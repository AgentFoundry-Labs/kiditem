import { Injectable } from '@nestjs/common';
import type { Order } from '@prisma/client';
import type { OrdersResponse, OrderRow } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  confirmOrderSheets,
  uploadInvoice,
  DELIVERY_COMPANIES,
} from '../../channels/adapters/coupang/orders';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { from?: string; to?: string; status?: string }): Promise<OrdersResponse> {
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
        status: dbStatus,
        ...(Object.keys(orderedAtFilter).length > 0 && {
          orderedAt: orderedAtFilter,
        }),
      },
      orderBy: { orderedAt: 'desc' },
    });

    return {
      items: orders.map((o) => o satisfies OrderRow),
      total: orders.length,
      deliveryCompanies: [...DELIVERY_COMPANIES],
    } satisfies OrdersResponse;
  }

  async findOne(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { id } });
  }

  async getStats(): Promise<{
    stats: { total: number; accept: number; instruct: number; departure: number; delivering: number; finalDelivery: number };
    today: { orders: number; revenue: number };
    week: { orders: number; revenue: number };
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay();
    const weekStart = new Date(todayStart.getTime() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 86400000);

    const [total, accept, instruct, departure, delivering, finalDelivery, todayAgg, weekAgg] =
      await Promise.all([
        this.prisma.order.count(),
        this.prisma.order.count({ where: { status: 'ACCEPT' } }),
        this.prisma.order.count({ where: { status: 'INSTRUCT' } }),
        this.prisma.order.count({ where: { status: 'DEPARTURE' } }),
        this.prisma.order.count({ where: { status: 'DELIVERING' } }),
        this.prisma.order.count({ where: { status: 'FINAL_DELIVERY' } }),
        this.prisma.order.aggregate({
          where: { orderedAt: { gte: todayStart } },
          _count: true,
          _sum: { totalPrice: true },
        }),
        this.prisma.order.aggregate({
          where: { orderedAt: { gte: weekStart } },
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
    };
  }

  async confirm(shipmentBoxIds: number[]): Promise<{ message: string; data: unknown }> {
    const result = await confirmOrderSheets(shipmentBoxIds);
    return {
      message: `${shipmentBoxIds.length}건 승인 완료`,
      data: result,
    };
  }

  async uploadInvoice(
    shipmentBoxId: number,
    deliveryCompanyCode: string,
    invoiceNumber: string,
  ): Promise<{ message: string; data: unknown }> {
    const result = await uploadInvoice(shipmentBoxId, {
      deliveryCompanyCode,
      invoiceNumber,
    });
    return { message: '송장 전송 완료', data: result };
  }
}
