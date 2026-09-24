import { Inject, Injectable } from '@nestjs/common';
import { KiditemConflictError } from '@kiditem/shared/errors';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProcurementRepositoryPort,
  PurchaseOrderCreateCommand,
  PurchaseOrderListQuery,
  PurchaseOrderStatusUpdate,
} from '../../../application/port/out/repository/procurement.repository.port';
import {
  PRODUCT_SOURCE_READ_PORT,
  type ProductSourceReadPort,
} from '../../../../products/application/port/in/product-source-read.port';

type PurchaseOrderSummarySource = {
  totalAmountCny: Prisma.Decimal | number | string;
  items: { quantity: number }[];
};

@Injectable()
export class ProcurementRepositoryAdapter implements ProcurementRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_SOURCE_READ_PORT)
    private readonly productSources: ProductSourceReadPort,
  ) {}

  async list(organizationId: string, query: PurchaseOrderListQuery) {
    await this.prisma.$executeRaw`
      UPDATE purchase_order_submission_attempts
      SET
        status = 'provider_unknown',
        error_code = 'prepared_intent_expired',
        error_message = 'Prepared provider intent exceeded the reconciliation window.',
        updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'prepared'
        AND created_at <= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    `;
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const supplierId = query.supplierId ?? query.supplier;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId,
      ...(query.orderId ? { id: query.orderId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(supplierId ? { supplierId } : {}),
    };

    const [items, total, grouped, summaryOrders] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          items: true,
          supplier: true,
          submissionAttempts: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              idempotencyKey: true,
              status: true,
              providerReference: true,
              errorCode: true,
              errorMessage: true,
              reconciliationOutcome: true,
              reconciledAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
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
      items: items.map(({ submissionAttempts, ...order }) => ({
        ...order,
        latestSubmissionAttempt: submissionAttempts?.[0] ?? null,
      })),
      total,
      page,
      limit,
      counts: buildStatusCounts(grouped),
      summary: summarizePurchaseOrders(summaryOrders),
    };
  }

  async createDraft(
    organizationId: string,
    command: PurchaseOrderCreateCommand,
  ) {
    const existing = command.idempotencyKey
      ? await this.prisma.purchaseOrder.findFirst({
          where: { organizationId, idempotencyKey: command.idempotencyKey },
          include: { items: true, supplier: true },
        })
      : null;
    if (existing) {
      if (existing.requestHash !== command.requestHash) {
        throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'PURCHASE_ORDER_DRAFT_IDEMPOTENCY_CONFLICT' } });
      }
      return { ok: true as const, order: existing };
    }

    if (command.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: command.supplierId, organizationId },
        select: { id: true },
      });
      if (!supplier)
        return { ok: false as const, reason: 'supplier_not_found' as const };
    }

    const canonical = await this.resolveItems(organizationId, command);
    if (canonical.missingMasterProductIds.length > 0) {
      return {
        ok: false as const,
        reason: 'master_product_not_found' as const,
        missingMasterProductIds: canonical.missingMasterProductIds,
      };
    }

    const totalAmountCny = canonical.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCny,
      0,
    );

    try {
      const order = await this.prisma.purchaseOrder.create({
        data: {
          organization: { connect: { id: organizationId } },
          supplierName: command.supplierName,
          ...(command.supplierId
            ? {
                supplier: {
                  connect: {
                    id_organizationId: {
                      id: command.supplierId,
                      organizationId,
                    },
                  },
                },
              }
            : {}),
          totalAmountCny,
          status: 'draft',
          orderDate: new Date(),
          expectedDeliveryDate: command.expectedDeliveryDate
            ? new Date(command.expectedDeliveryDate)
            : null,
          ...(command.idempotencyKey
            ? { idempotencyKey: command.idempotencyKey }
            : {}),
          ...(command.requestHash ? { requestHash: command.requestHash } : {}),
          items: {
            create: canonical.items.map((item) => ({
              productName: item.productName,
              organization: { connect: { id: organizationId } },
              legacySellpiaInventorySkuId: null,
              masterProductId: item.masterProductId,
              quantity: item.quantity,
              unitPriceCny: item.unitPriceCny,
            })),
          },
        },
        include: { items: true, supplier: true },
      });
      return { ok: true as const, order };
    } catch (error) {
      if (!command.idempotencyKey || !isUniqueConstraintError(error))
        throw error;
      const raced = await this.prisma.purchaseOrder.findFirst({
        where: { organizationId, idempotencyKey: command.idempotencyKey },
        include: { items: true, supplier: true },
      });
      if (!raced || raced.requestHash !== command.requestHash) {
        throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'PURCHASE_ORDER_DRAFT_IDEMPOTENCY_CONFLICT' } });
      }
      return { ok: true as const, order: raced };
    }
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
            legacySellpiaInventorySkuId: true,
            masterProductId: true,
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
        legacySellpiaInventorySkuId: item.legacySellpiaInventorySkuId,
        masterProductId: item.masterProductId,
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

  private async resolveItems(
    organizationId: string,
    command: PurchaseOrderCreateCommand,
  ): Promise<{
    items: Array<PurchaseOrderCreateCommand['items'][number] & {
      masterProductId: string;
    }>;
    missingMasterProductIds: string[];
  }> {
    const requestedIds = Array.from(new Set(command.items.map((item) => item.masterProductId)));
    const owned = await this.productSources.findByIds(organizationId, requestedIds);
    const byMasterProductId = new Map(
      owned.flatMap((source) => source.masterProductId
        ? [[source.masterProductId, source] as const]
        : []),
    );
    const missingMasterProductIds: string[] = [];
    const items = command.items.flatMap((item) => {
      const requestedId = item.masterProductId;
      const source = requestedId
        ? byMasterProductId.get(requestedId)
        : undefined;
      // An explicit id is still untrusted input. Resolve it through the
      // organization-scoped Products reader before persisting the line.
      const masterProductId = source?.masterProductId ?? null;
      if (!masterProductId) {
        if (requestedId) missingMasterProductIds.push(requestedId);
        return [];
      }
      return [{
        ...item,
        masterProductId,
      }];
    });
    return {
      items,
      missingMasterProductIds: [...new Set(missingMasterProductIds)],
    };
  }
}

function buildStatusCounts(
  grouped: { status: string; _count: { id: number } }[],
) {
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
      totalQuantity:
        summary.totalQuantity +
        order.items.reduce((sum, item) => sum + item.quantity, 0),
      totalAmountCny: summary.totalAmountCny + toNumber(order.totalAmountCny),
    }),
    { orderCount: 0, totalQuantity: 0, totalAmountCny: 0 },
  );
}

function toNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number {
  return Number(value ?? 0);
}

function decimalString(value: Prisma.Decimal | number | string): string {
  return String(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
