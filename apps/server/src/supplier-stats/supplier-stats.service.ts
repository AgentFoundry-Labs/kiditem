import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupplierStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 거래처별 매출 집계: supplier -> supplierProduct -> product의 주문/매출 합산 */
  async getSalesBySupplier(companyId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { companyId },
      include: {
        supplierProducts: {
          include: {
            product: {
              include: {
                orders: {
                  select: { quantity: true, totalPrice: true },
                },
              },
            },
          },
        },
      },
    });

    return suppliers.map((supplier) => {
      let totalOrders = 0;
      let totalRevenue = 0;
      let totalQuantity = 0;

      for (const sp of supplier.supplierProducts) {
        for (const order of sp.product.orders) {
          totalOrders += 1;
          totalRevenue += order.totalPrice;
          totalQuantity += order.quantity;
        }
      }

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        productCount: supplier.supplierProducts.length,
        totalOrders,
        totalQuantity,
        totalRevenue,
      };
    });
  }

  /** 특정 거래처의 상품별 매출 */
  async getProductSales(companyId: string, supplierId: string) {
    const supplierProducts = await this.prisma.supplierProduct.findMany({
      where: { supplierId },
      include: {
        product: {
          include: {
            orders: {
              where: { companyId },
              select: { quantity: true, totalPrice: true },
            },
          },
        },
      },
    });

    return supplierProducts.map((sp) => {
      const totalOrders = sp.product.orders.length;
      const totalQuantity = sp.product.orders.reduce((sum, o) => sum + o.quantity, 0);
      const totalRevenue = sp.product.orders.reduce((sum, o) => sum + o.totalPrice, 0);

      return {
        productId: sp.product.id,
        productName: sp.product.name,
        supplyPrice: sp.supplyPrice,
        totalOrders,
        totalQuantity,
        totalRevenue,
      };
    });
  }

  /** 거래처 거래 이력: purchaseOrder + supplierPayment를 시간순 타임라인으로 */
  async getHistory(companyId: string, supplierId: string) {
    const [purchaseOrders, payments] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { companyId, supplierId },
        orderBy: { orderDate: 'desc' },
      }),
      this.prisma.supplierPayment.findMany({
        where: { companyId, supplierId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const timeline = [
      ...purchaseOrders.map((po) => ({
        type: 'purchaseOrder' as const,
        id: po.id,
        date: po.orderDate,
        amount: Number(po.totalAmountCny),
        status: po.status,
        description: `발주 #${po.id.slice(0, 8)} - ${po.supplierName}`,
      })),
      ...payments.map((p) => ({
        type: 'payment' as const,
        id: p.id,
        date: p.createdAt,
        amount: p.amount,
        status: p.status,
        description: p.notes ?? `결제 ${p.amount.toLocaleString()}원`,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return timeline;
  }
}
