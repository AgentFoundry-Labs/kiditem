import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationParams } from '../../common/pagination';

export interface InventorySummary {
  total: number;
  reorderCount: number;
  outOfStockCount: number;
  unsyncedCount: number;
  overstockCount: number;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { page?: string; limit?: string; status?: string }) {
    try {
      const { page, limit, skip } = paginationParams(query);
      const statusFilter = query.status;

      const rows = await this.prisma.inventory.findMany({
        include: {
          product: {
            include: { company: true },
          },
        },
      });

      const enriched = rows.map((inv) => {
        const avgDailySales = Number(inv.dailySalesAvg ?? 0);
        const leadTimeDays = inv.leadTimeDays ?? 14;
        const currentStock = inv.currentStock;
        const safetyStock = inv.safetyStock;
        const reorderPoint = inv.reorderPoint;

        const optimalStock =
          avgDailySales > 0
            ? Math.round(avgDailySales * (leadTimeDays + 7))
            : safetyStock || 0;
        const daysRemaining =
          avgDailySales > 0
            ? Math.round(currentStock / avgDailySales)
            : currentStock > 0
              ? 999
              : 0;
        const recommendedOrder = Math.max(0, optimalStock - currentStock);

        let status = 'normal';
        if (currentStock === 0) status = 'critical';
        else if (currentStock <= reorderPoint && reorderPoint > 0)
          status = 'warning';
        else if (optimalStock > 0 && currentStock > optimalStock * 2)
          status = 'overstock';

        return {
          id: inv.id,
          productId: inv.productId,
          productName: inv.product?.name ?? 'N/A',
          sku: null,
          company: inv.product?.company?.name ?? 'N/A',
          grade: inv.product?.abcGrade ?? 'C',
          currentStock,
          safetyStock,
          reorderPoint,
          leadTimeDays,
          avgDailySales,
          optimalStock,
          daysRemaining,
          recommendedOrder,
          status,
        };
      });

      const summary: InventorySummary = {
        total: enriched.length,
        reorderCount: 0,
        outOfStockCount: 0,
        unsyncedCount: 0,
        overstockCount: 0,
      };
      for (const item of enriched) {
        const unsynced =
          item.currentStock === 0 &&
          item.avgDailySales === 0 &&
          item.optimalStock <= item.safetyStock;
        if (unsynced) {
          summary.unsyncedCount++;
          continue;
        }
        if (item.currentStock === 0) summary.outOfStockCount++;
        if (item.status === 'critical' || item.status === 'warning')
          summary.reorderCount++;
        if (item.status === 'overstock') summary.overstockCount++;
      }

      // status는 계산 필드이므로 메모리에서 필터
      const filtered =
        statusFilter && statusFilter !== 'all'
          ? enriched.filter((i) => {
              if (statusFilter === 'reorder')
                return i.status === 'critical' || i.status === 'warning';
              if (statusFilter === 'overstock')
                return i.status === 'overstock';
              return i.status === statusFilter;
            })
          : enriched;

      const total = filtered.length;
      const items = filtered.slice(skip, skip + limit);
      return { items, total, page, limit, summary };
    } catch {
      throw new InternalServerErrorException('재고 데이터 조회 실패');
    }
  }

  async receiveStock(id: string, quantity: number) {
    if (!quantity || quantity <= 0) {
      throw new BadRequestException('수량은 1 이상이어야 합니다.');
    }

    const inv = await this.prisma.inventory.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!inv) {
      throw new NotFoundException('재고 항목을 찾을 수 없습니다.');
    }

    const updated = await this.prisma.inventory.update({
      where: { id },
      data: {
        currentStock: { increment: quantity },
        lastRestockedAt: new Date(),
      },
    });

    await this.prisma.stockTransaction.create({
      data: {
        companyId: inv.companyId,
        productId: inv.productId,
        productName: inv.product?.name,
        type: 'receive',
        quantity,
        note: '검수 입고',
      },
    });

    return {
      id: updated.id,
      productId: inv.productId,
      productName: inv.product?.name ?? 'N/A',
      currentStock: updated.currentStock,
      received: quantity,
    };
  }

  async findByProductId(productId: string) {
    const inv = await this.prisma.inventory.findUnique({
      where: { productId },
      include: { product: true },
    });
    if (!inv) {
      throw new NotFoundException('해당 상품의 재고 항목이 없습니다.');
    }
    return { id: inv.id, productId: inv.productId, productName: inv.product?.name ?? 'N/A' };
  }
}
