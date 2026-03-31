import { Injectable } from '@nestjs/common';
import type { Order } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  confirmOrderSheets,
  uploadInvoice,
  DELIVERY_COMPANIES,
} from '../../coupang/orders';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { from?: string; to?: string; status?: string }): Promise<{
    success: boolean;
    orders: Order[];
    count: number;
    deliveryCompanies: typeof DELIVERY_COMPANIES;
  }> {
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
      success: true,
      orders,
      count: orders.length,
      deliveryCompanies: DELIVERY_COMPANIES,
    };
  }

  async findOne(id: string): Promise<{ success: boolean; order: Order | null }> {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    return { success: true, order };
  }

  async getStats(): Promise<{
    success: boolean;
    stats: { total: number; accept: number; instruct: number; departure: number; delivering: number; finalDelivery: number };
  }> {
    const [total, accept, instruct, departure, delivering, finalDelivery] =
      await Promise.all([
        this.prisma.order.count(),
        this.prisma.order.count({ where: { status: 'ACCEPT' } }),
        this.prisma.order.count({ where: { status: 'INSTRUCT' } }),
        this.prisma.order.count({ where: { status: 'DEPARTURE' } }),
        this.prisma.order.count({ where: { status: 'DELIVERING' } }),
        this.prisma.order.count({ where: { status: 'FINAL_DELIVERY' } }),
      ]);

    return {
      success: true,
      stats: { total, accept, instruct, departure, delivering, finalDelivery },
    };
  }

  async confirm(shipmentBoxIds: number[]): Promise<{ success: boolean; message: string; data: unknown }> {
    const result = await confirmOrderSheets(shipmentBoxIds);
    return {
      success: true,
      message: `${shipmentBoxIds.length}건 승인 완료`,
      data: result,
    };
  }

  async uploadInvoice(
    shipmentBoxId: number,
    deliveryCompanyCode: string,
    invoiceNumber: string,
  ): Promise<{ success: boolean; message: string; data: unknown }> {
    const result = await uploadInvoice(shipmentBoxId, {
      deliveryCompanyCode,
      invoiceNumber,
    });
    return { success: true, message: '송장 전송 완료', data: result };
  }
}
