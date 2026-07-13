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

const ORDER_STATUS_EXCLUDE = ['cancelled', 'returned'] as const;

type SupplierPaymentHistoryRow = {
  amount: number;
  paidAmount?: number | null;
  status: string;
};

type PhysicalProductPolicy = {
  id: string;
  masterProductId: string;
  supplyPrice: number;
  minOrderQty: number;
  isPrimary: boolean;
  masterProduct: {
    id: string;
    code: string;
    name: string;
    optionName: string | null;
  };
};

type SupplierProjection = {
  id: string;
  name: string;
  supplierProducts: PhysicalProductPolicy[];
};

type RecipeComponent = {
  masterProductId: string | null;
  quantity: number;
};

type OrderLineProjection = {
  id: string;
  quantity: number;
  totalPrice: number;
  listingOption: { components: RecipeComponent[] } | null;
};

type RunningStats = {
  orderLineIds: Set<string>;
  totalQuantity: number;
  totalRevenue: number;
};

type SalesProjection = {
  suppliers: SupplierProjection[];
  supplierStats: Map<string, RunningStats>;
  productStats: Map<string, RunningStats>;
  unallocatedRevenue: number;
};

function createRunningStats(): RunningStats {
  return { orderLineIds: new Set(), totalQuantity: 0, totalRevenue: 0 };
}

function productStatsKey(supplierId: string, masterProductId: string): string {
  return `${supplierId}:${masterProductId}`;
}

function settledSupplierPaymentAmount(payment: SupplierPaymentHistoryRow): number {
  const paidAmount = payment.paidAmount ?? 0;
  if (paidAmount > 0) return paidAmount;
  return payment.status === 'paid' ? payment.amount : 0;
}

function summarizeSupplierSales(
  items: SupplierSalesRow[],
  unallocatedRevenue: number,
): SupplierSalesReport['summary'] {
  return items.reduce<SupplierSalesReport['summary']>(
    (summary, item) => ({
      supplierCount: summary.supplierCount + 1,
      productCount: summary.productCount + item.productCount,
      totalOrders: summary.totalOrders + item.totalOrders,
      totalQuantity: summary.totalQuantity + item.totalQuantity,
      totalRevenue: summary.totalRevenue + item.totalRevenue,
      unallocatedRevenue,
    }),
    {
      supplierCount: 0,
      productCount: 0,
      totalOrders: 0,
      totalQuantity: 0,
      totalRevenue: 0,
      unallocatedRevenue,
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

  return { totalOrdered, totalPaid, unpaid: 0, orderCount, paymentCount };
}

@Injectable()
export class SupplierStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Supplier sales are derived from confirmed channel-SKU recipes. A bundle
   * line contributes physical units to each component's primary supplier and
   * its revenue is split once by extended component purchase cost.
   */
  async getSalesBySupplier(organizationId: string): Promise<SupplierSalesReport> {
    const projection = await this.loadSalesProjection(organizationId);
    const items = projection.suppliers.map((supplier) => {
      const stats = projection.supplierStats.get(supplier.id) ?? createRunningStats();
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        productCount: supplier.supplierProducts.length,
        totalOrders: stats.orderLineIds.size,
        totalQuantity: stats.totalQuantity,
        totalRevenue: stats.totalRevenue,
      } satisfies SupplierSalesRow;
    });

    return {
      summary: summarizeSupplierSales(items, projection.unallocatedRevenue),
      items,
    };
  }

  /** Physical Sellpia Master breakdown for one supplier. */
  async getProductSales(
    organizationId: string,
    supplierId: string,
  ): Promise<SupplierProductSalesReport> {
    const projection = await this.loadSalesProjection(organizationId);
    const supplier = projection.suppliers.find((candidate) => candidate.id === supplierId);
    if (!supplier) {
      return { summary: summarizeProductSales([]), items: [] };
    }

    const items = supplier.supplierProducts.flatMap((policy): SupplierProductSalesRow[] => {
      const master = policy.masterProduct;
      if (!master) return [];
      const stats = projection.productStats.get(
        productStatsKey(supplier.id, policy.masterProductId),
      ) ?? createRunningStats();
      return [{
        masterId: master.id,
        masterCode: master.code,
        masterName: master.name,
        optionName: master.optionName,
        supplyPrice: policy.supplyPrice,
        minOrderQty: policy.minOrderQty,
        totalOrders: stats.orderLineIds.size,
        totalQuantity: stats.totalQuantity,
        totalRevenue: stats.totalRevenue,
      }];
    });

    return {
      summary: summarizeProductSales(items),
      items,
    };
  }

  /** Purchase-order and supplier-payment timeline. */
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
      ...payments.map((payment) => {
        const settled = settledSupplierPaymentAmount(payment);
        return {
          type: 'payment' as const,
          id: payment.id,
          date: payment.createdAt,
          amount: settled,
          status: payment.status,
          description: payment.notes ?? `결제 ${settled.toLocaleString()}원`,
        };
      }),
    ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

    return { summary: summarizeSupplierHistory(items), items };
  }

  private async loadSalesProjection(organizationId: string): Promise<SalesProjection> {
    const [suppliers, orderLines] = await Promise.all([
      this.prisma.supplier.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          supplierProducts: {
            where: { organizationId },
            select: {
              id: true,
              masterProductId: true,
              supplyPrice: true,
              minOrderQty: true,
              isPrimary: true,
              masterProduct: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  optionName: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.orderLineItem.findMany({
        where: {
          organizationId,
          order: {
            organizationId,
            status: { notIn: [...ORDER_STATUS_EXCLUDE] },
          },
        },
        select: {
          id: true,
          quantity: true,
          totalPrice: true,
          listingOption: {
            select: {
              components: {
                select: { masterProductId: true, quantity: true },
              },
            },
          },
        },
      }),
    ]);

    return this.projectSales(
      suppliers as SupplierProjection[],
      orderLines as OrderLineProjection[],
    );
  }

  private projectSales(
    suppliers: SupplierProjection[],
    orderLines: OrderLineProjection[],
  ): SalesProjection {
    const primaryByMasterId = new Map<string, {
      supplierId: string;
      policy: PhysicalProductPolicy;
    }>();
    const supplierStats = new Map<string, RunningStats>();
    const productStats = new Map<string, RunningStats>();

    for (const supplier of suppliers) {
      supplierStats.set(supplier.id, createRunningStats());
      for (const policy of supplier.supplierProducts) {
        if (!policy.masterProductId) continue;
        productStats.set(
          productStatsKey(supplier.id, policy.masterProductId),
          createRunningStats(),
        );
        if (policy.isPrimary) {
          primaryByMasterId.set(policy.masterProductId, { supplierId: supplier.id, policy });
        }
      }
    }

    let unallocatedRevenue = 0;
    for (const line of orderLines) {
      const components = line.listingOption?.components ?? [];
      const allocations = components.map((component) => {
        const primary = component.masterProductId
          ? primaryByMasterId.get(component.masterProductId)
          : undefined;
        if (primary && component.masterProductId && component.quantity > 0) {
          const physicalQuantity = line.quantity * component.quantity;
          const supplier = supplierStats.get(primary.supplierId)!;
          const product = productStats.get(
            productStatsKey(primary.supplierId, component.masterProductId),
          )!;
          supplier.orderLineIds.add(line.id);
          supplier.totalQuantity += physicalQuantity;
          product.orderLineIds.add(line.id);
          product.totalQuantity += physicalQuantity;
        }
        return {
          component,
          primary,
          weight: primary ? primary.policy.supplyPrice * component.quantity : 0,
        };
      });

      const complete = allocations.length > 0 && allocations.every(({ component, primary, weight }) =>
        component.masterProductId != null
        && component.quantity > 0
        && primary != null
        && weight > 0,
      );
      if (!complete) {
        unallocatedRevenue += line.totalPrice;
        continue;
      }

      const ordered = [...allocations].sort((left, right) =>
        left.component.masterProductId!.localeCompare(right.component.masterProductId!),
      );
      const totalWeight = ordered.reduce((sum, item) => sum + item.weight, 0);
      let allocatedRevenue = 0;
      for (let index = 0; index < ordered.length; index += 1) {
        const allocation = ordered[index];
        const isLast = index === ordered.length - 1;
        const revenue = isLast
          ? line.totalPrice - allocatedRevenue
          : Math.floor((line.totalPrice * allocation.weight) / totalWeight);
        allocatedRevenue += revenue;
        const masterProductId = allocation.component.masterProductId!;
        const supplierId = allocation.primary!.supplierId;
        supplierStats.get(supplierId)!.totalRevenue += revenue;
        productStats.get(productStatsKey(supplierId, masterProductId))!.totalRevenue += revenue;
      }
    }

    return { suppliers, supplierStats, productStats, unallocatedRevenue };
  }
}
