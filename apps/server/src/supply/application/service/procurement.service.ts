import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isDeletablePurchaseOrderStatus,
  isValidPurchaseOrderTransition,
} from '../../domain/policy/purchase-order-status';

type PurchaseOrderSummarySource = {
  totalAmountCny: Prisma.Decimal | number | string;
  items: { quantity: number }[];
};

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  return Number(value ?? 0);
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

@Injectable()
export class ProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, query: { page?: number; limit?: number; status?: string; supplier?: string; supplierId?: string }): Promise<{
    items: unknown[];
    total: number;
    page: number;
    limit: number;
    counts: { all: number; draft: number; pending: number; ordered: number; shipped: number; received: number; cancelled: number };
    summary: { orderCount: number; totalQuantity: number; totalAmountCny: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { status } = query;
    const supplierId = query.supplierId ?? query.supplier;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
    };

    const [items, total, grouped, summaryOrders] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          items: true,
          supplier: true,
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

    const countMap: Record<string, number> = {};
    let all = 0;
    for (const g of grouped) {
      countMap[g.status] = g._count.id;
      all += g._count.id;
    }

    const counts = {
      all,
      draft: countMap['draft'] || 0,
      pending: countMap['pending'] || 0,
      ordered: countMap['ordered'] || 0,
      shipped: countMap['shipped'] || 0,
      received: countMap['received'] || 0,
      cancelled: countMap['cancelled'] || 0,
    };

    return { items, total, page, limit, counts, summary: summarizePurchaseOrders(summaryOrders) };
  }

  async create(organizationId: string, data: {
    supplierName: string;
    supplierId?: string;
    items: {
      productName: string;
      productId?: string;
      optionId?: string;
      quantity: number;
      unitPriceCny: number;
    }[];
    expectedDeliveryDate?: string;
  }) {
    const totalAmountCny = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCny,
      0,
    );

    if (data.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: data.supplierId, organizationId },
        select: { id: true },
      });
      if (!supplier) {
        throw new BadRequestException('거래처를 찾을 수 없거나 권한이 없습니다');
      }
    }

    // tenant boundary 검증 — optionId 가 client input 그대로 흘러오므로
    // ProductOption 의 organizationId 일치 여부를 사전 확인하지 않으면
    // foreign-key 만으로는 cross-organization 침범이 막히지 않는다 (IDOR).
    // PR #193 review #2 (yhc125) 후속 fix.
    const optionIds = Array.from(
      new Set(
        data.items
          .map((item) => item.optionId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    if (optionIds.length > 0) {
      const owned = await this.prisma.productOption.findMany({
        where: { id: { in: optionIds }, organizationId, isDeleted: false },
        select: { id: true },
      });
      if (owned.length !== optionIds.length) {
        const ownedSet = new Set(owned.map((row) => row.id));
        const missing = optionIds.filter((id) => !ownedSet.has(id));
        throw new BadRequestException(
          `발주 항목의 옵션을 찾을 수 없거나 권한이 없습니다: ${missing.join(', ')}`,
        );
      }
    }

    return this.prisma.purchaseOrder.create({
      data: {
        organizationId,
        supplierName: data.supplierName,
        supplierId: data.supplierId || null,
        totalAmountCny,
        status: 'draft',
        orderDate: new Date(),
        expectedDeliveryDate: data.expectedDeliveryDate
          ? new Date(data.expectedDeliveryDate)
          : null,
        items: {
          create: data.items.map((item) => ({
            productName: item.productName,
            optionId: item.optionId || null,
            quantity: item.quantity,
            unitPriceCny: item.unitPriceCny,
          })),
        },
      },
      include: { items: true, supplier: true },
    });
  }

  async updateStatus(organizationId: string, id: string, newStatus: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });

    if (!order) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }

    if (!isValidPurchaseOrderTransition(order.status, newStatus)) {
      throw new BadRequestException(
        `상태 전환 불가: ${order.status} → ${newStatus}`,
      );
    }

    const updateData: Prisma.PurchaseOrderUpdateManyMutationInput = { status: newStatus };
    if (newStatus === 'received') {
      updateData.receivedAt = new Date();
    }

    const { count } = await this.prisma.purchaseOrder.updateMany({
      where: { id, organizationId },
      data: updateData,
    });
    if (count === 0) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }

    const updated = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: { items: true, supplier: true },
    });
    if (!updated) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }
    return updated;
  }

  async delete(organizationId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });

    if (!order) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }

    if (!isDeletablePurchaseOrderStatus(order.status)) {
      throw new BadRequestException(
        '임시저장 또는 대기 상태의 발주만 삭제할 수 있습니다',
      );
    }

    const { count } = await this.prisma.purchaseOrder.deleteMany({
      where: { id, organizationId },
    });
    if (count === 0) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }
    return order;
  }
}
