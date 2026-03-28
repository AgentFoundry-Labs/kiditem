import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginationParams,
  type PaginatedResponse,
} from '../common/pagination';

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: {
    page?: string;
    limit?: string;
  }): Promise<PaginatedResponse<Record<string, unknown>>> {
    try {
      const { page, limit, skip } = paginationParams(query);
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      // Get paginated products with ad tier
      const [productsData, totalProducts] = await Promise.all([
        this.prisma.product.findMany({
          where: {
            adTier: { not: null },
            status: 'active',
          },
          include: { company: true },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.product.count({
          where: {
            adTier: { not: null },
            status: 'active',
          },
        }),
      ]);

      if (productsData.length === 0) {
        return { items: [], total: totalProducts, page, limit };
      }

      const productIds = productsData.map((p) => p.id);

      // Aggregate ads and profit/loss data for these products only
      const [adsAgg, plData] = await Promise.all([
        this.prisma.ad.groupBy({
          by: ['productId'],
          where: { productId: { in: productIds } },
          _sum: {
            spend: true,
            impressions: true,
            clicks: true,
            conversions: true,
            roas: true,
          },
          orderBy: { productId: 'asc' },
        }),
        this.prisma.profitLoss.findMany({
          where: { year, month, productId: { in: productIds } },
        }),
      ]);

      const adsMap = new Map(
        adsAgg.map((a) => [
          a.productId,
          {
            spend: a._sum.spend ?? 0,
            impressions: a._sum.impressions ?? 0,
            clicks: a._sum.clicks ?? 0,
            conversions: a._sum.conversions ?? 0,
            roas: a._sum.roas ?? 0,
          },
        ]),
      );
      const plByProduct = new Map(plData.map((pl) => [pl.productId, pl]));

      const result = productsData.map((p) => {
        const ads = adsMap.get(p.id) || {
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          roas: 0,
        };
        const totalSpend = ads.spend;
        const totalImpressions = ads.impressions;
        const totalClicks = ads.clicks;
        const totalConversions = ads.conversions;
        const totalAdRevenue = Math.round((totalSpend * Number(ads.roas)) / 100);

        const ctr =
          totalImpressions > 0
            ? (totalClicks / totalImpressions) * 100
            : 0;
        const convRate =
          totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
        const roas =
          totalSpend > 0 ? (totalAdRevenue / totalSpend) * 100 : 0;
        const acos =
          totalAdRevenue > 0 ? (totalSpend / totalAdRevenue) * 100 : 0;

        const pl = plByProduct.get(p.id);
        const plRevenue = pl?.revenue ?? 0;
        const adRate = plRevenue > 0 ? (totalSpend / plRevenue) * 100 : 0;

        return {
          id: p.id,
          name: p.name,
          sku: null,
          company: p.company?.name ?? 'N/A',
          grade: p.abcGrade ?? 'C',
          adTier: p.adTier,
          spend: totalSpend,
          impressions: totalImpressions,
          clicks: totalClicks,
          conversions: totalConversions,
          adRevenue: totalAdRevenue,
          ctr: Math.round(ctr * 100) / 100,
          convRate: Math.round(convRate * 100) / 100,
          roas: Math.round(roas),
          acos: Math.round(acos * 10) / 10,
          adRate: Math.round(adRate * 10) / 10,
          revenue: plRevenue,
          netProfit: pl?.netProfit ?? 0,
          profitRate:
            plRevenue > 0
              ? Math.round(((pl?.netProfit ?? 0) / plRevenue) * 1000) / 10
              : 0,
        };
      });

      return { items: result, total: totalProducts, page, limit };
    } catch {
      throw new InternalServerErrorException('광고 데이터 조회 실패');
    }
  }

  private emptyAdSummary() {
    return {
      totalSpend: 0,
      totalAdRevenue: 0,
      totalRevenue: 0,
      overallAdRate: 0,
      overallRoas: 0,
      highAdCount: 0,
      gradeSpend: { A: 0, B: 0, C: 0 },
      tierSpend: {},
      gradeSpendPercent: { A: 0, B: 0, C: 0 },
    };
  }
}
