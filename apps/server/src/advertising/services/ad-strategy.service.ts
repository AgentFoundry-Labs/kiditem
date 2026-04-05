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

  async getWeeklyPlan() {
    const latest = await this.getLatestAgentResult();
    if (!latest?.plan) {
      const budgetAllocation = await this.calcBudgetAllocation();
      return {
        generatedAt: null,
        totalProducts: 0,
        summary: { scaleUp: 0, optimize: 0, reduce: 0, stop: 0, newStart: 0 },
        budgetAllocation,
        keyMetrics: { totalAdSpend: 0, totalAdRevenue: 0, overallRoas: 0 },
      };
    }
    const budgetAllocation = await this.calcBudgetAllocation();
    return { ...latest.plan, budgetAllocation, generatedAt: latest.generatedAt };
  }

  async getRecommendations() {
    const latest = await this.getLatestAgentResult();
    if (!latest?.cards) return { cards: [], keyMetrics: null };
    return { cards: latest.cards, keyMetrics: latest.plan?.keyMetrics };
  }
}
