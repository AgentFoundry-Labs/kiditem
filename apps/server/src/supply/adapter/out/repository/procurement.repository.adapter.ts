import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProcurementRepositoryPort,
  PurchaseOrderCreateCommand,
  PurchaseOrderListQuery,
  PurchaseOrderStatusUpdate,
} from '../../../application/port/out/repository/procurement.repository.port';

type PurchaseOrderSummarySource = {
  totalAmountCny: Prisma.Decimal | number | string;
  items: { quantity: number }[];
};

@Injectable()
export class ProcurementRepositoryAdapter implements ProcurementRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: PurchaseOrderListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const supplierId = query.supplierId ?? query.supplier;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(supplierId ? { supplierId } : {}),
    };

    const [items, total, grouped, summaryOrders] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { items: true, supplier: true },
        orderBy: { orderDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.purchaseOrder.findMany({
        where,
        select: {
          totalAmountCny: true,
          items: { select: { quantity: true } },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      counts: buildStatusCounts(grouped),
      summary: summarizePurchaseOrders(summaryOrders),
    };
  }

  async createDraft(organizationId: string, command: PurchaseOrderCreateCommand) {
    if (command.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: command.supplierId, organizationId },
        select: { id: true },
      });
      if (!supplier) return { ok: false as const, reason: 'supplier_not_found' as const };
    }

    const missingOptionIds = await this.findMissingOwnedOptionIds(organizationId, command);
    if (missingOptionIds.length > 0) {
      return { ok: false as const, reason: 'option_not_found' as const, missingOptionIds };
    }

    const totalAmountCny = command.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCny,
      0,
    );

    const order = await this.prisma.purchaseOrder.create({
      data: {
        organizationId,
        supplierName: command.supplierName,
        supplierId: command.supplierId || null,
        totalAmountCny,
        status: 'draft',
        orderDate: new Date(),
        expectedDeliveryDate: command.expectedDeliveryDate
          ? new Date(command.expectedDeliveryDate)
          : null,
        items: {
          create: command.items.map((item) => ({
            productName: item.productName,
            optionId: item.optionId || null,
            quantity: item.quantity,
            unitPriceCny: item.unitPriceCny,
          })),
        },
      },
      include: { items: true, supplier: true },
    });

    return { ok: true as const, order };
  }

  findScopedStatus(organizationId: string, id: string) {
    return this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
  }

  async findCheckoutSnapshot(organizationId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        supplierName: true,
        supplierId: true,
        totalAmountCny: true,
        items: {
          select: {
            productName: true,
            optionId: true,
            quantity: true,
            unitPriceCny: true,
          },
        },
      },
    });
    if (!order) return null;

    return {
      id: order.id,
      supplierName: order.supplierName,
      supplierId: order.supplierId,
      totalAmountCny: decimalString(order.totalAmountCny),
      items: order.items.map((item) => ({
        productName: item.productName,
        optionId: item.optionId,
        quantity: item.quantity,
        unitPriceCny: decimalString(item.unitPriceCny),
      })),
    };
  }

  async updateStatusScoped(
    organizationId: string,
    id: string,
    expectedStatus: string,
    update: PurchaseOrderStatusUpdate,
  ) {
    const { count } = await this.prisma.purchaseOrder.updateMany({
      where: { id, organizationId, status: expectedStatus },
      data: update,
    });
    if (count === 0) return null;

    return this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: { items: true, supplier: true },
    });
  }

  findScopedForDelete(organizationId: string, id: string) {
    return this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
  }

  async deleteScoped(organizationId: string, id: string) {
    const { count } = await this.prisma.purchaseOrder.deleteMany({
      where: { id, organizationId, status: { in: ['draft', 'pending'] } },
    });
    return count > 0;
  }

  private async findMissingOwnedOptionIds(
    organizationId: string,
    command: PurchaseOrderCreateCommand,
  ) {
    const optionIds = Array.from(
      new Set(
        command.items
          .map((item) => item.optionId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    if (optionIds.length === 0) return [];

    const owned = await this.prisma.productOption.findMany({
      where: { id: { in: optionIds }, organizationId, isDeleted: false },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((row) => row.id));
    return optionIds.filter((id) => !ownedSet.has(id));
  }
}

function buildStatusCounts(grouped: { status: string; _count: { id: number } }[]) {
  const countMap: Record<string, number> = {};
  let all = 0;
  for (const g of grouped) {
    countMap[g.status] = g._count.id;
    all += g._count.id;
  }

  return {
    all,
    draft: countMap.draft || 0,
    pending: countMap.pending || 0,
    ordered: countMap.ordered || 0,
    shipped: countMap.shipped || 0,
    received: countMap.received || 0,
    cancelled: countMap.cancelled || 0,
  };
}

function summarizePurchaseOrders(orders: PurchaseOrderSummarySource[]) {
  return orders.reduce(
    (summary, order) => ({
      orderCount: summary.orderCount + 1,
      totalQuantity: summary.totalQuantity + order.items.reduce((sum, item) => sum + item.quantity, 0),
      totalAmountCny: summary.totalAmountCny + toNumber(order.totalAmountCny),
    }),
    { orderCount: 0, totalQuantity: 0, totalAmountCny: 0 },
  );
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  return Number(value ?? 0);
}

function decimalString(value: Prisma.Decimal | number | string): string {
  return String(value);
}
