import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';

@Injectable()
export class AdCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adConfigService: AdConfigService,
  ) {}

  private async getDefaultCompanyId(): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!company) throw new InternalServerErrorException('회사 정보를 찾을 수 없습니다');
    return company.id;
  }

  async getCampaigns(period?: string, campaign?: string) {
    try {
      const companyId = await this.getDefaultCompanyId();
      const p = period || '7d';

      // 캠페인 스냅샷 (최신 날짜만)
      const allSnapshots = await this.prisma.adCampaignSnapshot.findMany({
        where: { companyId, period: p },
        orderBy: { date: 'desc' },
      });

      // 캠페인별 최신만
      const latestMap = new Map<string, (typeof allSnapshots)[0]>();
      for (const s of allSnapshots) {
        if (!latestMap.has(s.campaignName)) latestMap.set(s.campaignName, s);
      }

      // 상품 드릴다운
      let products: Array<{
        imageUrl: string | null;
        productName: string;
        vendorItemId: string | null;
        onOff: string | null;
        status: string | null;
        keyword: string | null;
        adSpend: number;
        adRevenue: number;
        impressions: number;
        clicks: number;
        ctr: number | null;
        adConversions: number;
        conversionRate: number | null;
        roas: number;
      }> = [];

      if (campaign) {
        let rawProducts = await this.prisma.adProductSnapshot.findMany({
          where: {
            companyId,
            campaignName: campaign,
            productName: { not: '' },
          },
          orderBy: [{ date: 'desc' }, { adSpend: 'desc' }],
        });

        // 최신 날짜만
        if (rawProducts.length > 0) {
          const latestDate = rawProducts[0].date;
          rawProducts = rawProducts.filter(
            (rp) => rp.date.getTime() === latestDate.getTime(),
          );
        }

        // 중복 제거
        const seen = new Set<string>();
        rawProducts = rawProducts.filter((rp) => {
          const key = rp.productName + (rp.vendorItemId || '');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Product 테이블에서 이미지 매칭
        const vendorItemIds = rawProducts
          .map((rp) => rp.vendorItemId)
          .filter((v): v is string => !!v && v.trim().length > 0);

        const productImageMap = new Map<string, string>();
        if (vendorItemIds.length > 0) {
          const productRows = await this.prisma.product.findMany({
            where: {
              imageUrl: { not: null },
              coupangProductId: { in: vendorItemIds },
            },
            select: { coupangProductId: true, imageUrl: true },
          });
          for (const row of productRows) {
            if (row.coupangProductId && row.imageUrl) {
              productImageMap.set(row.coupangProductId, row.imageUrl);
            }
          }
        }

        products = rawProducts.map((rp) => ({
          imageUrl: (rp.vendorItemId && productImageMap.get(rp.vendorItemId)) || null,
          productName: rp.productName,
          vendorItemId: rp.vendorItemId,
          onOff: rp.onOff,
          status: rp.status,
          keyword: rp.keyword,
          adSpend: rp.adSpend,
          adRevenue: rp.adRevenue,
          impressions: rp.impressions,
          clicks: rp.clicks,
          ctr: rp.ctr ? Number(rp.ctr) : null,
          adConversions: rp.adConversions,
          conversionRate: rp.conversionRate ? Number(rp.conversionRate) : null,
          roas: rp.adSpend > 0 ? Math.round((rp.adRevenue / rp.adSpend) * 100) : 0,
        }));
      }

      // _전체 분리, 나머지 정렬
      const campaignList = [...latestMap.values()]
        .filter((c) => c.campaignName !== '_전체')
        .sort((a, b) => {
          if (b.adRevenue !== a.adRevenue) return b.adRevenue - a.adRevenue;
          const bRoas = b.roas ? Number(b.roas) : 0;
          const aRoas = a.roas ? Number(a.roas) : 0;
          if (bRoas !== aRoas) return bRoas - aRoas;
          return b.clicks - a.clicks;
        });

      const overall = latestMap.get('_전체');

      const totalKpi = overall
        ? {
            adSpend: overall.adSpend,
            adRevenue: overall.adRevenue,
            totalRevenue: overall.totalRevenue,
            impressions: overall.impressions,
            clicks: overall.clicks,
            conversions: overall.conversions,
            orders: overall.orders,
            roas: overall.roas ? Number(overall.roas) : 0,
            ctr: overall.ctr ? Number(overall.ctr) : 0,
            conversionRate: overall.conversionRate ? Number(overall.conversionRate) : 0,
          }
        : {
            adSpend: campaignList.reduce((s, c) => s + c.adSpend, 0),
            adRevenue: campaignList.reduce((s, c) => s + c.adRevenue, 0),
            totalRevenue: campaignList.reduce((s, c) => s + c.totalRevenue, 0),
            impressions: campaignList.reduce((s, c) => s + c.impressions, 0),
            clicks: campaignList.reduce((s, c) => s + c.clicks, 0),
            conversions: campaignList.reduce((s, c) => s + c.conversions, 0),
            orders: campaignList.reduce((s, c) => s + c.orders, 0),
            roas: 0,
            ctr: 0,
            conversionRate: 0,
          };

      return {
        period: p,
        totalKpi,
        campaigns: campaignList.map((c) => ({
          campaignName: c.campaignName,
          date: c.date,
          adSpend: c.adSpend,
          adRevenue: c.adRevenue,
          impressions: c.impressions,
          clicks: c.clicks,
          ctr: c.ctr ? Number(c.ctr) : 0,
          conversions: c.conversions,
          roas: c.roas ? Number(c.roas) : 0,
          conversionRate: c.conversionRate ? Number(c.conversionRate) : 0,
          budget: c.budget,
          todaySpend: c.todaySpend,
        })),
        products,
      };
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('캠페인 데이터 조회 실패');
    }
  }

  async getTrends(days?: number) {
    try {
      const companyId = await this.getDefaultCompanyId();
      const d = Math.min(days || 14, 90);

      const since = new Date();
      since.setDate(since.getDate() - d);
      since.setHours(0, 0, 0, 0);

      // 일별 집계
      const ads = await this.prisma.ad.findMany({
        where: { companyId, date: { gte: since } },
        select: { date: true, spend: true, revenue: true, clicks: true, impressions: true, conversions: true },
        orderBy: { date: 'asc' },
      });

      const dayMap = new Map<string, { spend: number; revenue: number; clicks: number; impressions: number; conversions: number }>();
      for (const ad of ads) {
        const key = ad.date.toISOString().slice(0, 10);
        const prev = dayMap.get(key) || { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 };
        prev.spend += ad.spend;
        prev.revenue += ad.revenue;
        prev.clicks += ad.clicks;
        prev.impressions += ad.impressions;
        prev.conversions += ad.conversions;
        dayMap.set(key, prev);
      }

      const daily = [...dayMap.entries()]
        .map(([date, data]) => ({
          date,
          label: `${parseInt(date.slice(5, 7))}/${parseInt(date.slice(8, 10))}`,
          spend: Math.round(data.spend),
          revenue: Math.round(data.revenue),
          roas: data.spend > 0 ? Math.round((data.revenue / data.spend) * 100) : 0,
          clicks: data.clicks,
          impressions: data.impressions,
          conversions: data.conversions,
          ctr: data.impressions > 0 ? Math.round((data.clicks / data.impressions) * 10000) / 100 : 0,
          cvr: data.clicks > 0 ? Math.round((data.conversions / data.clicks) * 10000) / 100 : 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 전반 vs 후반 비교
      const mid = Math.floor(daily.length / 2);
      const firstHalf = daily.slice(0, mid);
      const secondHalf = daily.slice(mid);

      const avg = (arr: typeof daily, key: 'roas' | 'spend' | 'revenue' | 'ctr' | 'cvr') =>
        arr.length > 0 ? Math.round(arr.reduce((s, item) => s + item[key], 0) / arr.length) : 0;
      const sum = (arr: typeof daily, key: 'spend' | 'revenue' | 'clicks' | 'conversions') =>
        arr.reduce((s, item) => s + item[key], 0);

      const comparison = {
        roas: { before: avg(firstHalf, 'roas'), after: avg(secondHalf, 'roas'), change: avg(secondHalf, 'roas') - avg(firstHalf, 'roas') },
        spend: { before: sum(firstHalf, 'spend'), after: sum(secondHalf, 'spend'), change: sum(secondHalf, 'spend') - sum(firstHalf, 'spend') },
        revenue: { before: sum(firstHalf, 'revenue'), after: sum(secondHalf, 'revenue'), change: sum(secondHalf, 'revenue') - sum(firstHalf, 'revenue') },
        ctr: { before: avg(firstHalf, 'ctr'), after: avg(secondHalf, 'ctr'), change: avg(secondHalf, 'ctr') - avg(firstHalf, 'ctr') },
        cvr: { before: avg(firstHalf, 'cvr'), after: avg(secondHalf, 'cvr'), change: avg(secondHalf, 'cvr') - avg(firstHalf, 'cvr') },
        conversions: { before: sum(firstHalf, 'conversions'), after: sum(secondHalf, 'conversions'), change: sum(secondHalf, 'conversions') - sum(firstHalf, 'conversions') },
      };

      // ABC 등급별 광고비 분포
      const gradeAds = await this.prisma.ad.findMany({
        where: { companyId, date: { gte: since } },
        select: { spend: true, revenue: true, product: { select: { abcGrade: true } } },
      });

      const gradeDist = { A: { spend: 0, revenue: 0 }, B: { spend: 0, revenue: 0 }, C: { spend: 0, revenue: 0 } };
      for (const a of gradeAds) {
        const g = (a.product?.abcGrade || 'C') as 'A' | 'B' | 'C';
        if (g in gradeDist) {
          gradeDist[g].spend += a.spend;
          gradeDist[g].revenue += a.revenue;
        }
      }

      const config = await this.adConfigService.getConfig(companyId);
      const allocation = config.budget.allocation;

      const totalGradeSpend = gradeDist.A.spend + gradeDist.B.spend + gradeDist.C.spend;
      const budgetAllocation = [
        { grade: 'A', spend: Math.round(gradeDist.A.spend), revenue: Math.round(gradeDist.A.revenue), pct: totalGradeSpend > 0 ? Math.round((gradeDist.A.spend / totalGradeSpend) * 100) : 0, target: allocation.A || 60, roas: gradeDist.A.spend > 0 ? Math.round((gradeDist.A.revenue / gradeDist.A.spend) * 100) : 0 },
        { grade: 'B', spend: Math.round(gradeDist.B.spend), revenue: Math.round(gradeDist.B.revenue), pct: totalGradeSpend > 0 ? Math.round((gradeDist.B.spend / totalGradeSpend) * 100) : 0, target: allocation.B || 30, roas: gradeDist.B.spend > 0 ? Math.round((gradeDist.B.revenue / gradeDist.B.spend) * 100) : 0 },
        { grade: 'C', spend: Math.round(gradeDist.C.spend), revenue: Math.round(gradeDist.C.revenue), pct: totalGradeSpend > 0 ? Math.round((gradeDist.C.spend / totalGradeSpend) * 100) : 0, target: allocation.C || 10, roas: gradeDist.C.spend > 0 ? Math.round((gradeDist.C.revenue / gradeDist.C.spend) * 100) : 0 },
      ];

      return { daily, comparison, budgetAllocation, days: d };
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('트렌드 데이터 조회 실패');
    }
  }
}
