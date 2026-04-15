import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupplierStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 거래처별 매출 집계: supplier -> supplierProduct -> product의 주문/매출 합산 */
  async getSalesBySupplier(companyId: string) {
    // 1) Supplier 와 양쪽 매핑만 얇게 조회 (orders include 없이 Cartesian 폭발 회피)
    const suppliers = await this.prisma.supplier.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        supplierProducts: { select: { productId: true } },
        masterSupplierProducts: { select: { masterProductId: true } },
      },
    });

    // 2) MasterProduct -> Product[] 한 번에 해석
    const masterProductIds = Array.from(
      new Set(
        suppliers.flatMap((s) => s.masterSupplierProducts.map((m) => m.masterProductId)),
      ),
    );
    const productsByMasterId = new Map<string, string[]>();
    if (masterProductIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { masterProductId: { in: masterProductIds } },
        select: { id: true, masterProductId: true },
      });
      for (const p of products) {
        if (!p.masterProductId) continue;
        const arr = productsByMasterId.get(p.masterProductId) ?? [];
        arr.push(p.id);
        productsByMasterId.set(p.masterProductId, arr);
      }
    }

    // 3) 관련 productId 전체 모아서 groupBy 로 한 번에 집계
    const allProductIds = new Set<string>();
    for (const s of suppliers) {
      for (const sp of s.supplierProducts) allProductIds.add(sp.productId);
      for (const msp of s.masterSupplierProducts) {
        const pids = productsByMasterId.get(msp.masterProductId) ?? [];
        for (const pid of pids) allProductIds.add(pid);
      }
    }
    const orderStatsByProductId = new Map<
      string,
      { totalOrders: number; totalQuantity: number; totalRevenue: number }
    >();
    if (allProductIds.size > 0) {
      const grouped = await this.prisma.order.groupBy({
        by: ['productId'],
        where: { companyId, productId: { in: Array.from(allProductIds) } },
        _count: { _all: true },
        _sum: { quantity: true, totalPrice: true },
      });
      for (const g of grouped) {
        if (!g.productId) continue;
        orderStatsByProductId.set(g.productId, {
          totalOrders: g._count._all,
          totalQuantity: g._sum.quantity ?? 0,
          totalRevenue: g._sum.totalPrice ?? 0,
        });
      }
    }

    // 4) supplier 별로 집계 — 중복 productId 방지
    return suppliers.map((supplier) => {
      const countedProductIds = new Set<string>();
      let totalOrders = 0;
      let totalRevenue = 0;
      let totalQuantity = 0;

      const addFromProduct = (productId: string) => {
        if (countedProductIds.has(productId)) return;
        countedProductIds.add(productId);
        const stats = orderStatsByProductId.get(productId);
        if (!stats) return;
        totalOrders += stats.totalOrders;
        totalRevenue += stats.totalRevenue;
        totalQuantity += stats.totalQuantity;
      };

      for (const sp of supplier.supplierProducts) addFromProduct(sp.productId);
      for (const msp of supplier.masterSupplierProducts) {
        const pids = productsByMasterId.get(msp.masterProductId) ?? [];
        for (const pid of pids) addFromProduct(pid);
      }

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        productCount: supplier.supplierProducts.length + supplier.masterSupplierProducts.length,
        totalOrders,
        totalQuantity,
        totalRevenue,
      };
    });
  }

  /** 특정 거래처의 상품별 매출 */
  async getProductSales(companyId: string, supplierId: string) {
    const [supplierProducts, masterSupplierProducts] = await Promise.all([
      this.prisma.supplierProduct.findMany({
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
      }),
      this.prisma.masterSupplierProduct.findMany({
        where: { supplierId },
        include: {
          masterProduct: {
            include: {
              products: {
                include: {
                  orders: {
                    where: { companyId },
                    select: { quantity: true, totalPrice: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const countedProductIds = new Set<string>();
    const results: {
      productId: string;
      productName: string;
      supplyPrice: number;
      totalOrders: number;
      totalQuantity: number;
      totalRevenue: number;
    }[] = [];

    // SupplierProduct 경로
    for (const sp of supplierProducts) {
      countedProductIds.add(sp.product.id);
      const totalOrders = sp.product.orders.length;
      const totalQuantity = sp.product.orders.reduce((sum, o) => sum + o.quantity, 0);
      const totalRevenue = sp.product.orders.reduce((sum, o) => sum + o.totalPrice, 0);
      results.push({
        productId: sp.product.id,
        productName: sp.product.name,
        supplyPrice: sp.supplyPrice,
        totalOrders,
        totalQuantity,
        totalRevenue,
      });
    }

    // MasterSupplierProduct 경로 (중복 방지)
    for (const msp of masterSupplierProducts) {
      for (const prod of msp.masterProduct.products) {
        if (countedProductIds.has(prod.id)) continue;
        countedProductIds.add(prod.id);
        const totalOrders = prod.orders.length;
        const totalQuantity = prod.orders.reduce((sum, o) => sum + o.quantity, 0);
        const totalRevenue = prod.orders.reduce((sum, o) => sum + o.totalPrice, 0);
        results.push({
          productId: prod.id,
          productName: prod.name,
          supplyPrice: msp.supplyPrice,
          totalOrders,
          totalQuantity,
          totalRevenue,
        });
      }
    }

    return results;
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
