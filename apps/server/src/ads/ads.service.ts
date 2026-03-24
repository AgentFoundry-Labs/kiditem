import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const productsData = await this.prisma.product.findMany({
        where: {
          adTier: { not: null },
          status: 'active',
        },
        include: { company: true },
      });

      const productIds = productsData.map((p) => p.id);
      if (productIds.length === 0) {
        return { products: [], summary: this.emptyAdSummary() };
      }

      const allAds = await this.prisma.ad.findMany({
        orderBy: { date: 'desc' },
      });

      const plData = await this.prisma.profitLoss.findMany({
        where: { year, month },
      });

      const adsByProduct = new Map<string, typeof allAds>();
      for (const a of allAds) {
        const arr = adsByProduct.get(a.productId) ?? [];
        arr.push(a);
        adsByProduct.set(a.productId, arr);
      }
      const plByProduct = new Map(plData.map((pl) => [pl.productId, pl]));

      const result = productsData.map((p) => {
        const productAds = (adsByProduct.get(p.id) ?? []).slice(0, 30);
        const totalSpend = productAds.reduce((s, a) => s + a.spend, 0);
        const totalImpressions = productAds.reduce(
          (s, a) => s + a.impressions,
          0,
        );
        const totalClicks = productAds.reduce((s, a) => s + a.clicks, 0);
        const totalConversions = productAds.reduce(
          (s, a) => s + a.conversions,
          0,
        );
        const totalAdRevenue = productAds.reduce((s, a) => {
          const r = a.roas ? Number(a.roas) : 0;
          return s + Math.round((a.spend * r) / 100);
        }, 0);

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

      const totalSpend = result.reduce((s, r) => s + r.spend, 0);
      const totalAdRevenue = result.reduce((s, r) => s + r.adRevenue, 0);
      const totalRevenue = result.reduce((s, r) => s + r.revenue, 0);

      const gradeSpend: Record<string, number> = { A: 0, B: 0, C: 0 };
      result.forEach((r) => {
        gradeSpend[r.grade] = (gradeSpend[r.grade] ?? 0) + r.spend;
      });

      const tierSpend: Record<string, number> = {};
      result.forEach((r) => {
        if (r.adTier)
          tierSpend[r.adTier] = (tierSpend[r.adTier] ?? 0) + r.spend;
      });

      return {
        products: result,
        summary: {
          totalSpend,
          totalAdRevenue,
          totalRevenue,
          overallAdRate:
            totalRevenue > 0
              ? Math.round((totalSpend / totalRevenue) * 1000) / 10
              : 0,
          overallRoas:
            totalSpend > 0
              ? Math.round((totalAdRevenue / totalSpend) * 100)
              : 0,
          highAdCount: result.filter((r) => r.adRate > 15).length,
          gradeSpend,
          tierSpend,
          gradeSpendPercent: {
            A:
              totalSpend > 0
                ? Math.round((gradeSpend.A / totalSpend) * 100)
                : 0,
            B:
              totalSpend > 0
                ? Math.round((gradeSpend.B / totalSpend) * 100)
                : 0,
            C:
              totalSpend > 0
                ? Math.round((gradeSpend.C / totalSpend) * 100)
                : 0,
          },
        },
      };
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
