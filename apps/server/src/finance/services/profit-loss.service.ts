import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PLData } from '@kiditem/shared';

@Injectable()
export class ProfitLossService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(period?: string): Promise<PLData[]> {
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

      const plProductIds = new Set(data.map((d) => d.productId));
      const plResults = data.map((d) => ({
        id: d.id,
        productId: d.productId,
        productName: d.product?.name ?? 'N/A',
        sku: d.product?.coupangProductId ?? null,
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
      } satisfies PLData));

      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 1);
      const periodStr = `${year}-${String(month).padStart(2, '0')}`;

      const orderRows = await this.prisma.$queryRaw<
        { seller_product_id: string; revenue: number; order_count: number }[]
      >`
        SELECT
          coi.seller_product_id,
          SUM(coi.order_price)::int AS revenue,
          COUNT(DISTINCT co.id)::int AS order_count
        FROM coupang_order_items coi
        JOIN coupang_orders co ON co.id = coi.order_id
        WHERE coi.seller_product_id IS NOT NULL
          AND co.ordered_at >= ${monthStart}
          AND co.ordered_at < ${monthEnd}
        GROUP BY coi.seller_product_id
        ORDER BY revenue DESC
      `;

      const sellerIds = orderRows.map((r) => r.seller_product_id);
      const products =
        sellerIds.length > 0
          ? await this.prisma.product.findMany({
              where: { coupangProductId: { in: sellerIds } },
              include: { company: true },
            })
          : [];
      const productMap = new Map(
        products.map((p) => [p.coupangProductId, p]),
      );

      const extraRows = orderRows
        .filter((r) => {
          const prod = productMap.get(r.seller_product_id);
          return !prod || !plProductIds.has(prod.id);
        })
        .map((r) => {
          const prod = productMap.get(r.seller_product_id);
          const rev = Number(r.revenue);
          const rate = prod?.commissionRate
            ? Number(prod.commissionRate)
            : 0.108;
          const comm = Math.round(rev * rate);
          const cnt = Number(r.order_count);
          const cogs = prod?.costCny
            ? Math.round(Number(prod.costCny) * 190 * cnt)
            : 0;
          const ship = (prod?.shippingCost ?? 0) * cnt;
          const net = rev - comm - cogs - ship;

          return {
            id: r.seller_product_id,
            productId: prod?.id ?? '',
            productName: prod?.name ?? r.seller_product_id,
            sku: r.seller_product_id,
            company: prod?.company?.name ?? 'N/A',
            grade: prod?.abcGrade ?? 'C',
            period: periodStr,
            revenue: rev,
            costOfGoods: cogs,
            commission: comm,
            shippingCost: ship,
            adCost: 0,
            otherCost: 0,
            netProfit: net,
            profitRate:
              rev > 0 ? Math.round((net / rev) * 1000) / 10 : 0,
            orderCount: cnt,
          } satisfies PLData;
        });

      return [...plResults, ...extraRows].sort(
        (a, b) => b.revenue - a.revenue,
      );
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
