import { ownerTransaction } from '../../prisma/owner-transaction';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../channels/application/port/in/channel-option-recipe.port';
import { Inject, Injectable } from '@nestjs/common';
import type {
  SupplierHistoryItem,
  SupplierHistoryReport,
  SupplierProductSalesReport,
  SupplierProductSalesRow,
  SupplierSalesReport,
  SupplierSalesRow,
} from '@kiditem/shared/supplier-stats';
import { PrismaService } from '../../prisma/prisma.service';
import { readPublishedOrderLines } from '../../orders/read/order-facts.reader';
import {
  PRODUCT_SOURCE_READ_PORT,
  type ProductSourceReadPort,
} from '../../products/application/port/in/product-source-read.port';

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
  masterProductId: string;
  quantity: number;
};

type OrderLineProjection = {
  id: string;
  quantity: number;
  totalPrice: number;
  listingOption: {
    inventoryComponents: RecipeComponent[];
  } | null;
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
  constructor(
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_SOURCE_READ_PORT)
    private readonly inventory: ProductSourceReadPort,
  ) {}

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

  /** Physical Sellpia inventory-SKU breakdown for one supplier. */
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
      const product = policy.masterProduct;
      const stats = projection.productStats.get(
        productStatsKey(supplier.id, policy.masterProductId),
      ) ?? createRunningStats();
      return [{
        masterId: product.id,
        masterCode: product.code,
        masterName: product.name,
        optionName: product.optionName,
        supplyPrice: policy.supplyPrice,
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

  /**
   * Supplier policies and every order line a completed Orders collection
   * published, through the Orders reader. The read spans all history, so it is
   * issued on the client rather than inside an interactive transaction whose
   * timeout a long history would outgrow, and it reads no window coverage it
   * would not use. The listing options' confirmed recipes then map each line
   * onto physical Sellpia SKUs.
   */
  private async loadSalesProjection(organizationId: string): Promise<SalesProjection> {
    const [suppliers, lines] = await Promise.all([
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
              isPrimary: true,
            },
          },
        },
      }),
      readPublishedOrderLines(this.prisma, {
        organizationId,
        excludedStatuses: ORDER_STATUS_EXCLUDE,
      }),
    ]);
    const optionIds = [...new Set(lines.flatMap((line) =>
      line.listingOptionId ? [line.listingOptionId] : []))];
    const options = optionIds.length === 0 ? [] : await this.channelRecipes.readConfirmedCompositions(ownerTransaction(this.prisma), { organizationId, optionIds }).then(rows => rows.map(row => ({ id: row.optionId, inventoryComponents: row.components })));

    const componentsByOption = new Map(options.map((option) => [option.id, option.inventoryComponents]));
    const orderLines: OrderLineProjection[] = lines.map((line) => {
      const components = line.listingOptionId ? componentsByOption.get(line.listingOptionId) : undefined;
      return {
        id: line.lineItemId,
        quantity: line.quantity,
        totalPrice: line.revenue,
        listingOption: components ? { inventoryComponents: components } : null,
      };
    });

    const masterProductIds = [...new Set(suppliers.flatMap((supplier) =>
      supplier.supplierProducts.flatMap((policy) =>
        policy.masterProductId ? [policy.masterProductId] : [])))];
    const identities = await this.inventory.findByIds(organizationId, masterProductIds);
    const byId = new Map(identities.map((identity) => [identity.masterProductId, identity]));
    const resolvedSuppliers = suppliers.map((supplier) => ({
      ...supplier,
      supplierProducts: supplier.supplierProducts.flatMap((policy): PhysicalProductPolicy[] => {
        const masterProductId = policy.masterProductId;
        if (!masterProductId) return [];
        const identity = byId.get(masterProductId);
        return identity
          ? [{
            id: policy.id,
            masterProductId,
            supplyPrice: policy.supplyPrice,
            isPrimary: policy.isPrimary,
            masterProduct: { ...identity, id: identity.masterProductId },
          }]
          : [];
      }),
    }));
    return this.projectSales(resolvedSuppliers, orderLines);
  }

  private projectSales(
    suppliers: SupplierProjection[],
    orderLines: OrderLineProjection[],
  ): SalesProjection {
    const primaryByMasterProductId = new Map<string, {
      supplierId: string;
      policy: PhysicalProductPolicy;
    }>();
    const supplierStats = new Map<string, RunningStats>();
    const productStats = new Map<string, RunningStats>();

    for (const supplier of suppliers) {
      supplierStats.set(supplier.id, createRunningStats());
      for (const policy of supplier.supplierProducts) {
        productStats.set(
          productStatsKey(supplier.id, policy.masterProductId),
          createRunningStats(),
        );
        if (policy.isPrimary) {
          primaryByMasterProductId.set(policy.masterProductId, { supplierId: supplier.id, policy });
        }
      }
    }

    let unallocatedRevenue = 0;
    for (const line of orderLines) {
      const components = line.listingOption?.inventoryComponents ?? [];
      const allocations = components.map((component) => {
        const primary = primaryByMasterProductId.get(component.masterProductId);
        if (primary && component.quantity > 0) {
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
        component.quantity > 0
        && primary != null
        && weight > 0,
      );
      if (!complete) {
        unallocatedRevenue += line.totalPrice;
        continue;
      }

      const ordered = [...allocations].sort((left, right) =>
        left.component.masterProductId.localeCompare(
          right.component.masterProductId,
        ),
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
        const masterProductId = allocation.component.masterProductId;
        const supplierId = allocation.primary!.supplierId;
        supplierStats.get(supplierId)!.totalRevenue += revenue;
        productStats.get(productStatsKey(supplierId, masterProductId))!.totalRevenue += revenue;
      }
    }

    return { suppliers, supplierStats, productStats, unallocatedRevenue };
  }
}
