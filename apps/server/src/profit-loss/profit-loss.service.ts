import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProfitLossService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(period?: string) {
    try {
      const { year, month } = period
        ? this.parsePeriod(period)
        : this.getCurrentYearMonth();

      const data = await this.prisma.profitLoss.findMany({
        where: { year, month },
        include: {
          product: {
            include: { company: true },
          },
        },
        orderBy: { netProfit: 'desc' },
      });

      return data.map((d) => ({
        id: d.id,
        productId: d.productId,
        productName: d.product?.name ?? 'N/A',
        sku: null,
        company: d.product?.company?.name ?? 'N/A',
        grade: d.product?.abcGrade ?? 'C',
        period: `${d.year}-${String(d.month).padStart(2, '0')}`,
        revenue: d.revenue,
        costOfGoods: d.cogs,
        commission: d.commission,
        shippingCost: d.shippingCost,
        adCost: d.adCost,
        otherCost: d.otherCost,
        netProfit: d.netProfit,
        profitRate:
          d.revenue > 0
            ? Math.round((d.netProfit / d.revenue) * 1000) / 10
            : 0,
        orderCount: d.orderCount,
      }));
    } catch {
      throw new InternalServerErrorException('손익 데이터 조회 실패');
    }
  }

  private getCurrentYearMonth() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  private parsePeriod(period: string): { year: number; month: number } {
    const [y, m] = period.split('-').map(Number);
    return { year: y, month: m };
  }
}
