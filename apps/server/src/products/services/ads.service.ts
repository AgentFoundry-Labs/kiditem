import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  paginationParams,
  type PaginatedResponse,
} from '../../common/pagination';

export interface AdProductItem {
  id: string;
  name: string;
  sku: string | null;
  company: string;
  grade: string;
  adTier: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  adRevenue: number;
  ctr: number;
  convRate: number;
  roas: number;
  acos: number;
  adRate: number;
  revenue: number;
  netProfit: number;
  profitRate: number;
}

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: {
    page?: string;
    limit?: string;
  }): Promise<PaginatedResponse<AdProductItem>> {
    try {
      const { page, limit, skip } = paginationParams(query);
      const items = await this.buildAdProducts({ skip, take: limit });
      const total = await this.prisma.product.count({
        where: { adTier: { not: null }, status: 'active' },
      });

      return { items, total, page, limit };
    } catch {
      throw new InternalServerErrorException('광고 데이터 조회 실패');
    }
  }

  async getHubData(): Promise<{
    products: AdProductItem[];
    summary: {
      totalSpend: number;
      totalAdRevenue: number;
      totalRevenue: number;
      overallAdRate: number;
      overallRoas: number;
      highAdCount: number;
      gradeSpend: Record<string, number>;
      tierSpend: Record<string, number>;
      gradeSpendPercent: Record<string, number>;
    };
  }> {
    try {
      const products = await this.buildAdProducts({});

      const totalSpend = products.reduce((s, p) => s + p.spend, 0);
      const totalAdRevenue = products.reduce((s, p) => s + p.adRevenue, 0);
      const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
      const overallAdRate =
        totalRevenue > 0
          ? Math.round((totalSpend / totalRevenue) * 1000) / 10
          : 0;
      const overallRoas =
        totalSpend > 0 ? Math.round((totalAdRevenue / totalSpend) * 100) : 0;
      const highAdCount = products.filter((p) => p.adRate > 15).length;

      const gradeSpend: Record<string, number> = { A: 0, B: 0, C: 0 };
      const tierSpend: Record<string, number> = {};
      for (const p of products) {
        gradeSpend[p.grade] = (gradeSpend[p.grade] || 0) + p.spend;
        if (p.adTier) {
          tierSpend[p.adTier] = (tierSpend[p.adTier] || 0) + p.spend;
        }
      }
      const gradeSpendPercent: Record<string, number> = {
        A: totalSpend > 0 ? Math.round((gradeSpend.A / totalSpend) * 100) : 0,
        B: totalSpend > 0 ? Math.round((gradeSpend.B / totalSpend) * 100) : 0,
        C: totalSpend > 0 ? Math.round((gradeSpend.C / totalSpend) * 100) : 0,
      };

      return {
        products,
        summary: {
          totalSpend,
          totalAdRevenue,
          totalRevenue,
          overallAdRate,
          overallRoas,
          highAdCount,
          gradeSpend,
          tierSpend,
          gradeSpendPercent,
        },
      };
    } catch {
      throw new InternalServerErrorException('광고 허브 데이터 조회 실패');
    }
  }

  async changeTier(
    productId: string,
    adTier: string,
  ): Promise<{ ok: boolean }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('상품을 찾을 수 없습니다');

    const validTiers = ['1차', '2차', '3차', 'OFF'];
    if (!validTiers.includes(adTier)) {
      throw new BadRequestException('유효하지 않은 티어입니다');
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { adTier: adTier === 'OFF' ? null : adTier },
    });

    return { ok: true };
  }

  private async buildAdProducts(opts: {
    skip?: number;
    take?: number;
  }): Promise<AdProductItem[]> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const productsData = await this.prisma.product.findMany({
      where: { adTier: { not: null }, status: 'active' },
      include: { company: true },
      ...(opts.skip != null ? { skip: opts.skip } : {}),
      ...(opts.take != null ? { take: opts.take } : {}),
      orderBy: { createdAt: 'desc' },
    });

    if (productsData.length === 0) return [];

    const productIds = productsData.map((p) => p.id);

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

    return productsData.map((p) => {
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
      const totalAdRevenue = Math.round(
        (totalSpend * Number(ads.roas)) / 100,
      );

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
  }
}
