import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      const rows = await this.prisma.inventory.findMany({
        include: {
          product: {
            include: { company: true },
          },
        },
      });

      return rows.map((inv) => {
        const avgDailySales = inv.dailySalesAvg ?? 0;
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
    } catch {
      throw new InternalServerErrorException('재고 데이터 조회 실패');
    }
  }
}
