import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_TRANSITIONS: Record<string, string> = {
  draft: 'pending',
  pending: 'ordered',
  ordered: 'shipped',
  shipped: 'received',
};

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [items, total, grouped] = await Promise.all([
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
        _count: { id: true },
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

    return { items, total, page, limit, counts };
  }

  async create(data: {
    companyId: string;
    supplierName: string;
    supplierId?: string;
    items: {
      productName: string;
      productId?: string;
      quantity: number;
      unitPriceCny: number;
    }[];
    expectedDeliveryDate?: string;
  }) {
    const totalAmountCny = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCny,
      0,
    );

    return this.prisma.purchaseOrder.create({
      data: {
        companyId: data.companyId,
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
            productId: item.productId || null,
            quantity: item.quantity,
            unitPriceCny: item.unitPriceCny,
          })),
        },
      },
      include: { items: true, supplier: true },
    });
  }

  async updateStatus(id: string, newStatus: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!order) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }

    const expectedNext = VALID_TRANSITIONS[order.status];
    if (!expectedNext || expectedNext !== newStatus) {
      throw new BadRequestException(
        `상태 전환 불가: ${order.status} → ${newStatus}`,
      );
    }

    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'received') {
      updateData.receivedAt = new Date();
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: { items: true, supplier: true },
    });
  }

  async delete(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!order) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }

    if (order.status !== 'draft' && order.status !== 'pending') {
      throw new BadRequestException(
        '임시저장 또는 대기 상태의 발주만 삭제할 수 있습니다',
      );
    }

    return this.prisma.purchaseOrder.delete({
      where: { id },
    });
  }
}
