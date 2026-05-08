import { Injectable } from '@nestjs/common';
import type {
  SupplierHistoryItem,
  SupplierHistoryReport,
  SupplierProductSalesReport,
  SupplierProductSalesRow,
  SupplierSalesReport,
  SupplierSalesRow,
} from '@kiditem/shared/supplier-stats';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Plan B2c.orders T7 — optionId-based aggregation.
 *
 * 3-layer schema (ADR-0013):
 *   Supplier → SupplierProduct(optionId)              — SKU 단위 공급가
 *   Supplier → MasterSupplierProduct(masterId)        — Master 단위 주공급처 정책 (supplyPrice 없음)
 *
 * 주문 집계 경로 (ADR-0015 channel-agnostic Order):
 *   OrderLineItem.optionId → groupBy (chunked, CHUNK=1000)
 *   where order.status ∉ {cancelled, returned}
 *
 * MasterSupplierProduct 경로의 supplyPrice 는 schema 상 존재하지 않으므로 null (spec §5.5).
 */

const OPTION_CHUNK_SIZE = 1000;
const ORDER_STATUS_EXCLUDE = ['cancelled', 'returned'] as const;

type OptionOrderStats = {
  totalOrders: number;
  totalQuantity: number;
  totalRevenue: number;
};

type SupplierPaymentHistoryRow = {
  amount: number;
  paidAmount?: number | null;
  status: string;
};

function settledSupplierPaymentAmount(payment: SupplierPaymentHistoryRow): number {
  const paidAmount = payment.paidAmount ?? 0;
  if (paidAmount > 0) return paidAmount;
  return payment.status === 'paid' ? payment.amount : 0;
}

function summarizeSupplierSales(items: SupplierSalesRow[]): SupplierSalesReport['summary'] {
  return items.reduce<SupplierSalesReport['summary']>(
    (summary, item) => ({
      supplierCount: summary.supplierCount + 1,
      productCount: summary.productCount + item.productCount,
      totalOrders: summary.totalOrders + item.totalOrders,
      totalQuantity: summary.totalQuantity + item.totalQuantity,
      totalRevenue: summary.totalRevenue + item.totalRevenue,
    }),
    {
      supplierCount: 0,
      productCount: 0,
      totalOrders: 0,
      totalQuantity: 0,
      totalRevenue: 0,
    },
  );
}

function summarizeProductSales(items: SupplierProductSalesRow[]): SupplierProductSalesReport['summary'] {
  return items.reduce<SupplierProductSalesReport['summary']>(
    (summary, item) => ({
      productCount: summary.productCount + 1,
      totalOrders: summary.totalOrders + item.totalOrders,
      totalQuantity: summary.totalQuantity + item.totalQuantity,
      totalRevenue: summary.totalRevenue + item.totalRevenue,
    }),
    {
      productCount: 0,
      totalOrders: 0,
      totalQuantity: 0,
      totalRevenue: 0,
    },
  );
}

function summarizeSupplierHistory(items: SupplierHistoryItem[]): SupplierHistoryReport['summary'] {
  let totalOrdered = 0;
  let totalPaid = 0;
  let unpaid = 0;
  let orderCount = 0;
  let paymentCount = 0;

  for (const item of items) {
    if (item.type === 'purchaseOrder') {
      orderCount += 1;
      totalOrdered += item.amount;
    } else {
      paymentCount += 1;
      totalPaid += item.amount;
    }
  }

  return { totalOrdered, totalPaid, unpaid, orderCount, paymentCount };
}

@Injectable()
export class SupplierStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 거래처별 매출 집계: supplier 의 SupplierProduct(optionId) + MasterSupplierProduct(masterId→options) 합산. */
  async getSalesBySupplier(organizationId: string): Promise<SupplierSalesReport> {
    // 1) Supplier 와 양쪽 매핑을 얇게 조회 (orders include 없이 Cartesian 폭발 회피)
    const suppliers = await this.prisma.supplier.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        supplierProducts: { select: { optionId: true } },
        masterSupplierProducts: { select: { masterId: true } },
      },
    });

    // 2) MasterSupplierProduct 경로 — masterId → ProductOption[] 해상도
    const masterIds = Array.from(
      new Set(suppliers.flatMap((s) => s.masterSupplierProducts.map((m) => m.masterId))),
    );
    const optionsByMasterId = new Map<string, string[]>();
    if (masterIds.length > 0) {
      const options = await this.prisma.productOption.findMany({
        where: { masterId: { in: masterIds }, isDeleted: false },
        select: { id: true, masterId: true },
      });
      for (const o of options) {
        const arr = optionsByMasterId.get(o.masterId) ?? [];
        arr.push(o.id);
        optionsByMasterId.set(o.masterId, arr);
      }
    }

    // 3) 관련 optionId 전체 모으고 chunked groupBy (OrderLineItem.optionId)
    const allOptionIds = new Set<string>();
    for (const s of suppliers) {
      for (const sp of s.supplierProducts) allOptionIds.add(sp.optionId);
      for (const msp of s.masterSupplierProducts) {
        for (const oid of optionsByMasterId.get(msp.masterId) ?? []) allOptionIds.add(oid);
      }
    }

    const orderStatsByOptionId = await this.aggregateOrdersByOptionIds(organizationId, allOptionIds);

    // 4) supplier 별 집계 — 중복 optionId 방지
    const items = suppliers.map((supplier) => {
      const counted = new Set<string>();
      let totalOrders = 0;
      let totalRevenue = 0;
      let totalQuantity = 0;

      const addFromOption = (optionId: string) => {
        if (counted.has(optionId)) return;
        counted.add(optionId);
        const stats = orderStatsByOptionId.get(optionId);
        if (!stats) return;
        totalOrders += stats.totalOrders;
        totalRevenue += stats.totalRevenue;
        totalQuantity += stats.totalQuantity;
      };

      for (const sp of supplier.supplierProducts) addFromOption(sp.optionId);
      for (const msp of supplier.masterSupplierProducts) {
        for (const oid of optionsByMasterId.get(msp.masterId) ?? []) addFromOption(oid);
      }

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        productCount: supplier.supplierProducts.length + supplier.masterSupplierProducts.length,
        totalOrders,
        totalQuantity,
        totalRevenue,
      } satisfies SupplierSalesRow;
    });

    return {
      summary: summarizeSupplierSales(items),
      items,
    };
  }

  /**
   * 특정 거래처의 SKU(option) 단위 매출.
   *
   * - SupplierProduct 경로: `supplyPrice` 는 schema 실값
   * - MasterSupplierProduct 경로: `supplyPrice` 는 schema 에 없으므로 `null` (spec §5.5)
   */
  async getProductSales(organizationId: string, supplierId: string): Promise<SupplierProductSalesReport> {
    const [supplierProducts, masterSupplierProducts] = await Promise.all([
      this.prisma.supplierProduct.findMany({
        where: {
          supplierId,
          supplier: { organizationId },
          option: { master: { organizationId } },
        },
        include: {
          option: {
            select: {
              id: true,
              sku: true,
              optionName: true,
              masterId: true,
              master: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
      this.prisma.masterSupplierProduct.findMany({
        where: {
          supplierId,
          supplier: { organizationId },
          master: { organizationId },
        },
        include: {
          master: {
            select: {
              id: true,
              code: true,
              name: true,
              options: {
                where: { isDeleted: false },
                select: { id: true, sku: true, optionName: true },
              },
            },
          },
        },
      }),
    ]);

    // 모든 optionId 수집
    const allOptionIds = new Set<string>();
    for (const sp of supplierProducts) allOptionIds.add(sp.optionId);
    for (const msp of masterSupplierProducts) {
      for (const o of msp.master.options) allOptionIds.add(o.id);
    }

    const orderStats = await this.aggregateOrdersByOptionIds(organizationId, allOptionIds);

    const counted = new Set<string>();
    const results: SupplierProductSalesRow[] = [];

    // SupplierProduct 경로 — supplyPrice 실값
    for (const sp of supplierProducts) {
      counted.add(sp.optionId);
      const stats = orderStats.get(sp.optionId) ?? {
        totalOrders: 0,
        totalQuantity: 0,
        totalRevenue: 0,
      };
      results.push({
        optionId: sp.optionId,
        sku: sp.option.sku,
        optionName: sp.option.optionName,
        masterId: sp.option.master.id,
        masterCode: sp.option.master.code,
        masterName: sp.option.master.name,
        supplyPrice: sp.supplyPrice,
        minOrderQty: sp.minOrderQty,
        ...stats,
      } satisfies SupplierProductSalesRow);
    }

    // MasterSupplierProduct 경로 — supplyPrice null (schema 에 없음, spec §5.5)
    for (const msp of masterSupplierProducts) {
      for (const opt of msp.master.options) {
        if (counted.has(opt.id)) continue;
        counted.add(opt.id);
        const stats = orderStats.get(opt.id) ?? {
          totalOrders: 0,
          totalQuantity: 0,
          totalRevenue: 0,
        };
        results.push({
          optionId: opt.id,
          sku: opt.sku,
          optionName: opt.optionName,
          masterId: msp.master.id,
          masterCode: msp.master.code,
          masterName: msp.master.name,
          supplyPrice: null,
          minOrderQty: msp.minOrderQty,
          ...stats,
        } satisfies SupplierProductSalesRow);
      }
    }

    return {
      summary: summarizeProductSales(results),
      items: results,
    };
  }

  /** 거래처 거래 이력: purchaseOrder + supplierPayment 를 시간순 타임라인으로. */
  async getHistory(organizationId: string, supplierId: string): Promise<SupplierHistoryReport> {
    const [purchaseOrders, payments] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { organizationId, supplierId },
        orderBy: { orderDate: 'desc' },
      }),
      this.prisma.supplierPayment.findMany({
        where: { organizationId, supplierId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const items = [
      ...purchaseOrders.map((po) => ({
        type: 'purchaseOrder' as const,
        id: po.id,
        date: po.orderDate,
        amount: Number(po.totalAmountCny),
        status: po.status,
        description: `발주 #${po.id.slice(0, 8)} - ${po.supplierName}`,
      })),
      ...payments.map((p) => {
        const settled = settledSupplierPaymentAmount(p);
        return {
          type: 'payment' as const,
          id: p.id,
          date: p.createdAt,
          amount: settled,
          status: p.status,
          description: p.notes ?? `결제 ${settled.toLocaleString()}원`,
        };
      }),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      summary: summarizeSupplierHistory(items),
      items,
    };
  }

  /**
   * OrderLineItem.optionId → groupBy 집계 (chunked for >1000 ids, Postgres IN 성능 안정화).
   *
   * organizationId 는 상위 Order 로 scope (ADR-0015 Order-level organization). status filter 로 cancelled/returned 제외.
   */
  private async aggregateOrdersByOptionIds(
    organizationId: string,
    optionIds: Set<string>,
  ): Promise<Map<string, OptionOrderStats>> {
    const result = new Map<string, OptionOrderStats>();
    if (optionIds.size === 0) return result;

    const idArray = Array.from(optionIds);
    for (let i = 0; i < idArray.length; i += OPTION_CHUNK_SIZE) {
      const chunk = idArray.slice(i, i + OPTION_CHUNK_SIZE);
      const grouped = await this.prisma.orderLineItem.groupBy({
        by: ['optionId'],
        where: {
          optionId: { in: chunk },
          order: { organizationId, status: { notIn: [...ORDER_STATUS_EXCLUDE] } },
        },
        _count: { _all: true },
        _sum: { quantity: true, totalPrice: true },
      });
      for (const g of grouped) {
        if (!g.optionId) continue;
        result.set(g.optionId, {
          totalOrders: g._count._all,
          totalQuantity: g._sum.quantity ?? 0,
          totalRevenue: g._sum.totalPrice ?? 0,
        });
      }
    }
    return result;
  }
}
