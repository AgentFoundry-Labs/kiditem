import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';

@Injectable()
export class AdStrategyService {
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

  private async getLatestAgentResult() {
    const run = await this.prisma.heartbeatRun.findFirst({
      where: { agent: { type: 'ad_strategy' }, status: 'succeeded' },
      orderBy: { finishedAt: 'desc' },
      select: { resultJson: true, finishedAt: true },
    });
    return run ? { ...(run.resultJson as any), generatedAt: run.finishedAt } : null;
  }

  private async calcBudgetAllocation() {
    const companyId = await this.getDefaultCompanyId();
    const config = await this.adConfigService.getConfig(companyId);

    const adAgg = await this.prisma.ad.groupBy({
      by: ['productId'],
      where: { companyId },
      _sum: { spend: true },
    });

    const products = await this.prisma.product.findMany({
      where: { companyId, isDeleted: false, id: { in: adAgg.map((a) => a.productId) } },
      select: { id: true, abcGrade: true },
    });

    const gradeMap = new Map(products.map((p) => [p.id, p.abcGrade || 'C']));
    const gradeSpend: Record<string, number> = { A: 0, B: 0, C: 0 };
    let totalSpend = 0;

    for (const a of adAgg) {
      const grade = gradeMap.get(a.productId) || 'C';
      const spend = a._sum.spend || 0;
      gradeSpend[grade] = (gradeSpend[grade] || 0) + spend;
      totalSpend += spend;
    }

    const allocation = config.budget.allocation;
    return ['A', 'B', 'C'].map((g) => ({
      grade: g,
      currentPercent: totalSpend > 0 ? Math.round((gradeSpend[g] / totalSpend) * 100) : 0,
      targetPercent: allocation[g] || 0,
      gap: totalSpend > 0
        ? Math.round((gradeSpend[g] / totalSpend) * 100) - (allocation[g] || 0)
        : 0,
    }));
  }

  async getRules() {
    const latest = await this.getLatestAgentResult();
    if (!latest?.recommendations) {
      return { summary: {}, recommendations: [] };
    }
    const recs = latest.recommendations as Array<{ priority?: string }>;
    return {
      summary: {
        total: recs.length,
        urgent: recs.filter((r) => r.priority === 'urgent').length,
        high: recs.filter((r) => r.priority === 'high').length,
        medium: recs.filter((r) => r.priority === 'medium').length,
        low: recs.filter((r) => r.priority === 'low').length,
      },
      recommendations: latest.recommendations,
    };
  }

  private getCurrentPeriod(): { year: number; month: number } {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  private async calcActions(companyId: string, year: number, month: number) {
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const products = await this.prisma.product.findMany({
      where: { companyId, isDeleted: false },
      select: {
        id: true,
        name: true,
        abcGrade: true,
        ads: {
          where: { companyId, date: { gte: since } },
          select: { spend: true, revenue: true },
        },
        profitLoss: {
          where: { companyId, year, month },
          select: { profitRate: true },
          take: 1,
        },
      },
    });

    return products
      .map((p) => {
        const spend = p.ads.reduce((s, a) => s + a.spend, 0);
        const adRevenue = p.ads.reduce((s, a) => s + a.revenue, 0);
        if (spend === 0) return null;

        const roas = spend > 0 ? (adRevenue / spend) * 100 : 0;
        const profitRate = Number(p.profitLoss[0]?.profitRate ?? 0) * 100;

        let action: string;
        let reason: string;
        if (roas < 100) {
          action = 'stop';
          reason = 'ROAS 100% 미만 — 광고 중단 권장';
        } else if (roas < 200) {
          action = 'decrease';
          reason = 'ROAS 200% 미만 — 예산 축소 권장';
        } else if (roas > 400 && profitRate > 10) {
          action = 'increase';
          reason = 'ROAS 400% 초과 + 수익률 10% 초과 — 예산 확대 권장';
        } else {
          action = 'maintain';
          reason = '현재 수준 유지';
        }

        return {
          productId: p.id,
          name: p.name,
          grade: p.abcGrade ?? null,
          action,
          reason,
          spend,
          roas: Math.round(roas),
          profitRate: Math.round(profitRate * 10) / 10,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  private async calcAdIssues(companyId: string, year: number, month: number) {
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const products = await this.prisma.product.findMany({
      where: { companyId, isDeleted: false },
      select: {
        id: true,
        name: true,
        ads: {
          where: { companyId, date: { gte: since } },
          select: { spend: true, revenue: true, clicks: true, conversions: true },
        },
        profitLoss: {
          where: { companyId, year, month },
          select: { revenue: true, adCost: true },
          take: 1,
        },
      },
    });

    const issues: {
      productId: string;
      name: string;
      issue: string;
      severity: string;
      metric: string;
    }[] = [];

    for (const p of products) {
      const spend = p.ads.reduce((s, a) => s + a.spend, 0);
      const adRevenue = p.ads.reduce((s, a) => s + a.revenue, 0);
      const clicks = p.ads.reduce((s, a) => s + a.clicks, 0);
      const conversions = p.ads.reduce((s, a) => s + a.conversions, 0);
      const plRevenue = p.profitLoss[0]?.revenue ?? 0;
      const adCost = p.profitLoss[0]?.adCost ?? 0;

      if (spend > 0 && adRevenue > 0) {
        const roas = (adRevenue / spend) * 100;
        if (roas < 100) {
          issues.push({
            productId: p.id,
            name: p.name,
            issue: 'ROAS 100% 미만',
            severity: 'high',
            metric: `ROAS ${Math.round(roas)}%`,
          });
        }
      }

      if (plRevenue > 0 && adCost > 0) {
        const adRate = (adCost / plRevenue) * 100;
        if (adRate > 20) {
          issues.push({
            productId: p.id,
            name: p.name,
            issue: '광고비 비율 과다',
            severity: 'medium',
            metric: `광고비율 ${Math.round(adRate * 10) / 10}%`,
          });
        }
      }

      if (clicks > 100 && conversions === 0) {
        issues.push({
          productId: p.id,
          name: p.name,
          issue: '전환 없음',
          severity: 'medium',
          metric: `클릭 ${clicks}회, 전환 0건`,
        });
      }
    }

    return issues;
  }

  private async calcTierAnalysis(companyId: string) {
    const tiers = await this.prisma.product.groupBy({
      by: ['adTier'],
      _count: { adTier: true },
      where: { companyId, status: 'active', adTier: { not: null }, isDeleted: false },
    });

    const tierIds = await Promise.all(
      tiers.map(async (t) => {
        const products = await this.prisma.product.findMany({
          where: { companyId, adTier: t.adTier, isDeleted: false },
          select: { id: true },
        });
        return { tier: t.adTier as string, ids: products.map((p) => p.id) };
      }),
    );

    return Promise.all(
      tierIds.map(async ({ tier, ids }) => {
        const agg = await this.prisma.ad.aggregate({
          where: { companyId, productId: { in: ids } },
          _sum: { spend: true, revenue: true },
        });
        const spend = agg._sum.spend ?? 0;
        const revenue = agg._sum.revenue ?? 0;
        const roas = spend > 0 ? Math.round((revenue / spend) * 100) : 0;
        return {
          tier,
          count: ids.length,
          spend,
          revenue,
          roas,
        };
      }),
    );
  }

  private async calcTop20(companyId: string, year: number, month: number) {
    const topPl = await this.prisma.profitLoss.findMany({
      where: { companyId, year, month },
      orderBy: { revenue: 'desc' },
      take: 20,
      include: {
        product: { select: { name: true, abcGrade: true, adTier: true } },
      },
    });

    const productIds = topPl.map((pl) => pl.productId);

    const adAgg = await this.prisma.ad.groupBy({
      by: ['productId'],
      where: { companyId, productId: { in: productIds } },
      _sum: { spend: true, revenue: true },
    });

    const adMap = new Map(
      adAgg.map((a) => [
        a.productId,
        { spend: a._sum.spend ?? 0, revenue: a._sum.revenue ?? 0 },
      ]),
    );

    return topPl.map((pl) => {
      const ad = adMap.get(pl.productId) ?? { spend: 0, revenue: 0 };
      const roas = ad.spend > 0 ? Math.round((ad.revenue / ad.spend) * 100) : 0;
      const profitRate = Math.round(Number(pl.profitRate ?? 0) * 1000) / 10;
      return {
        productId: pl.productId,
        name: pl.product.name,
        grade: pl.product.abcGrade ?? null,
        tier: pl.product.adTier ?? null,
        revenue: pl.revenue,
        adSpend: ad.spend,
        roas,
        profitRate,
      };
    });
  }

  async getWeeklyPlan() {
    const [latest, companyId] = await Promise.all([
      this.getLatestAgentResult(),
      this.getDefaultCompanyId(),
    ]);

    const { year, month } = this.getCurrentPeriod();

    const [budgetAllocation, actions, adIssues, tierAnalysis, top20] =
      await Promise.all([
        this.calcBudgetAllocation(),
        this.calcActions(companyId, year, month),
        this.calcAdIssues(companyId, year, month),
        this.calcTierAnalysis(companyId),
        this.calcTop20(companyId, year, month),
      ]);

    if (!latest?.plan) {
      return {
        generatedAt: null,
        totalProducts: 0,
        summary: { scaleUp: 0, optimize: 0, reduce: 0, stop: 0, newStart: 0 },
        budgetAllocation,
        keyMetrics: { totalAdSpend: 0, totalAdRevenue: 0, overallRoas: 0 },
        actions,
        adIssues,
        tierAnalysis,
        top20,
      };
    }

    return {
      ...latest.plan,
      budgetAllocation,
      generatedAt: latest.generatedAt,
      actions,
      adIssues,
      tierAnalysis,
      top20,
    };
  }

  async getRecommendations() {
    const latest = await this.getLatestAgentResult();
    if (!latest?.cards) return { cards: [], keyMetrics: null };
    return { cards: latest.cards, keyMetrics: latest.plan?.keyMetrics };
  }
}
