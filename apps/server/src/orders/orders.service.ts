import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  confirmOrderSheets,
  uploadInvoice,
  DELIVERY_COMPANIES,
} from '../coupang/orders';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { from?: string; to?: string; status?: string }) {
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.now() - 14 * 86400000);
    const to = query.to ? new Date(query.to) : new Date();
    const status = query.status || 'ACCEPT';

    const orders = await this.prisma.coupangOrder.findMany({
      where: {
        status,
        orderedAt: { gte: from, lte: to },
      },
      include: {
        orderItems: true,
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

  async findOne(id: string) {
    const order = await this.prisma.coupangOrder.findUnique({
      where: { id },
      include: { orderItems: true },
    });

    return { success: true, order };
  }

  async getStats() {
    const [total, accept, instruct, delivery, finalDelivery] =
      await Promise.all([
        this.prisma.coupangOrder.count(),
        this.prisma.coupangOrder.count({ where: { status: 'ACCEPT' } }),
        this.prisma.coupangOrder.count({ where: { status: 'INSTRUCT' } }),
        this.prisma.coupangOrder.count({ where: { status: 'DELIVERY' } }),
        this.prisma.coupangOrder.count({
          where: { status: 'FINAL_DELIVERY' },
        }),
      ]);

    return {
      success: true,
      stats: { total, accept, instruct, delivery, finalDelivery },
    };
  }

  async confirm(shipmentBoxIds: number[]) {
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
  ) {
    const result = await uploadInvoice(shipmentBoxId, {
      deliveryCompanyCode,
      invoiceNumber,
    });
    return { success: true, message: '송장 전송 완료', data: result };
  }
}
