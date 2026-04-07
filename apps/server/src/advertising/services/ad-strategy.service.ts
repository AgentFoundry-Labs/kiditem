import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import type { GradeBudgetAllocation } from './types';

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

  private async calcBudgetAllocation(): Promise<GradeBudgetAllocation[]> {
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
    const companyId = await this.getDefaultCompanyId();

    const [adAgg, products] = await Promise.all([
      this.prisma.ad.groupBy({
        by: ['productId'],
        where: { companyId },
        _sum: { spend: true, revenue: true, clicks: true, impressions: true, conversions: true },
      }),
      this.prisma.product.findMany({
        where: { companyId, isDeleted: false },
        include: {
          inventory: true,
          trafficStats: { where: { periodDays: 14 }, orderBy: { date: 'desc' }, take: 1 },
        },
      }),
    ]);

    const adMap = new Map(adAgg.map((a) => [a.productId, a._sum]));
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const recommendations: Array<Record<string, unknown>> = [];
    const alertsToCreate: Array<{ type: string; severity: string; title: string; message: string; productId: string; companyId: string }> = [];

    for (const p of products) {
      const ad = adMap.get(p.id);
      const spend = ad?.spend || 0;
      const revenue = ad?.revenue || 0;
      const clicks = ad?.clicks || 0;
      const impressions = ad?.impressions || 0;
      const conversions = ad?.conversions || 0;
      const roas = spend > 0 ? Math.round((revenue / spend) * 100) : 0;
      const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
      const cvr = clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0;
      const stock = (p as any).inventory?.currentStock || 0;
      const t14Rev = (p as any).trafficStats?.[0]?.revenue || 0;
      const margin = p.sellPrice && p.costPrice ? p.sellPrice - p.costPrice : 0;
      const adBudgetLimit = margin > 0 ? margin * 0.35 : 0;

      const recs: Array<{ rule: string; action: string; priority: string }> = [];

      // ═══ 공통 긴급 규칙 (등급 무관) ═══

      if (stock === 0 && p.adTier && spend > 0) {
        recs.push({
          rule: '긴급: 재고0 광고ON',
          action: '재고 없음 — 광고 즉시 중단. 재입고 확인 후 재개',
          priority: 'urgent',
        });
        alertsToCreate.push({
          type: 'strategy_change', severity: 'critical', productId: p.id, companyId,
          title: '재고 0 광고 ON',
          message: `[긴급] ${p.name} — 재고 0인데 광고 ON, 즉시 중단 필요`,
        });
      }

      if (clicks >= 50 && conversions === 0 && spend > 0) {
        recs.push({
          rule: 'C-5 전환0 조기손절',
          action: `클릭 ${clicks}회, 전환 0 — 키워드 OFF 또는 캠페인 중단 (광고비 ${Math.round(spend).toLocaleString()}원 낭비)`,
          priority: 'urgent',
        });
        if (spend >= 3000) {
          alertsToCreate.push({
            type: 'strategy_change', severity: 'critical', productId: p.id, companyId,
            title: '전환0 조기손절',
            message: `[조기손절] ${p.name} — 클릭 ${clicks}회 전환 0, 광고비 ${Math.round(spend).toLocaleString()}원 낭비`,
          });
        }
      }

      if (ctr >= 0.5 && roas < 100 && spend > 1000 && clicks >= 20) {
        recs.push({
          rule: 'B-7 CTR높음 전환낮음',
          action: `CTR ${ctr}% (양호) but ROAS ${roas}% (저조) — 썸네일은 OK, 상세페이지·가격·리뷰 재검토`,
          priority: 'high',
        });
        alertsToCreate.push({
          type: 'strategy_change', severity: 'warning', productId: p.id, companyId,
          title: 'CTR 높음 전환 낮음',
          message: `[상세페이지] ${p.name} — CTR ${ctr}% 양호하나 전환 저조(ROAS ${roas}%), 상세페이지/가격 점검`,
        });
      }

      if (adBudgetLimit > 0 && spend > adBudgetLimit * 14 && roas < 300) {
        recs.push({
          rule: '순이익 한도 초과',
          action: `광고비 ${Math.round(spend).toLocaleString()}원 > 순이익 한도 ${Math.round(adBudgetLimit * 14).toLocaleString()}원 — 예산 축소 또는 ROAS 목표 상향`,
          priority: 'high',
        });
      }

      // ═══ A등급 규칙 — 공격적 확장 ═══
      if (p.abcGrade === 'A' || t14Rev > 50000) {
        if (roas >= 480 && spend > 0) {
          recs.push({
            rule: 'A-1 매출 확대',
            action: `ROAS ${roas}% — 일예산 20% 증액 추천. 입찰가 10% 인상 검토`,
            priority: 'high',
          });
        } else if (roas >= 300 && ctr >= 0.3) {
          recs.push({
            rule: 'A-2 키워드 확장',
            action: `ROAS ${roas}% + CTR ${ctr}% — ${p.adTier || '없음'}→1차 승격. 매출최적화에서 발굴된 키워드를 수동 캠페인에 추가`,
            priority: 'high',
          });
        } else if (roas < 200 && spend > 3000) {
          recs.push({
            rule: 'A-3 위험 감지',
            action: `A등급 ROAS ${roas}%로 하락 — 입찰가 15% 하향 + 전환 0 키워드 제외 등록 + 아이템위너 상태 확인`,
            priority: 'urgent',
          });
          alertsToCreate.push({
            type: 'strategy_change', severity: 'critical', productId: p.id, companyId,
            title: 'A등급 ROAS 하락',
            message: `[전략수정] ${p.name} — A등급 ROAS ${roas}%로 하락, 아이템위너 확인 및 입찰가 조정 필요`,
          });
        } else if (!p.adTier && t14Rev > 30000) {
          recs.push({
            rule: 'A-4 신규 광고',
            action: `자연매출 ${Math.round(t14Rev).toLocaleString()}원 — 매출최적화 광고 먼저 시작 (ROAS 300~350%, 일예산 3만원). 7~14일 최적화 후 수동 캠페인 병행`,
            priority: 'medium',
          });
        }
        if (p.adTier && roas >= 300 && spend > 0) {
          recs.push({
            rule: 'A-5 매출최적화 병행',
            action: `수동 캠페인 ROAS ${roas}% 안정 — 매출최적화 캠페인 추가 개설로 신규 키워드 발굴 추천`,
            priority: 'low',
          });
        }
      }

      // ═══ B등급 규칙 — 최적화 집중 ═══
      else if (p.abcGrade === 'B' || (roas >= 100 && roas < 480)) {
        if (roas >= 480) {
          recs.push({
            rule: 'B-5 A승격',
            action: `ROAS ${roas}% — A등급 캠페인으로 이동. 예산 비중 확대 (60~70% 목표)`,
            priority: 'high',
          });
          alertsToCreate.push({
            type: 'strategy_change', severity: 'info', productId: p.id, companyId,
            title: 'A등급 승격 추천',
            message: `[A승격] ${p.name} — ROAS ${roas}% 달성, A등급 캠페인 이동 추천`,
          });
        } else if (roas >= 300) {
          recs.push({
            rule: 'B-3 예산 유지',
            action: `ROAS ${roas}% 안정 — 현재 예산 유지, 주간 모니터링. 제외 키워드 정리 추천`,
            priority: 'low',
          });
        } else if (roas >= 100 && ctr < 0.15) {
          recs.push({
            rule: 'B-2 소재 테스트',
            action: `CTR ${ctr}% 미달 — 썸네일 교체 추천. 경쟁사 상위 3개 썸네일 벤치마킹 후 A/B 테스트`,
            priority: 'medium',
          });
        } else if (roas >= 100 && roas < 200) {
          recs.push({
            rule: 'B-4 입찰가 하향',
            action: `ROAS ${roas}% — 입찰가 15% 하향. 메인 키워드 경쟁 과열이면 롱테일 키워드(100~300원)로 전환`,
            priority: 'medium',
          });
        } else if (roas >= 200) {
          recs.push({
            rule: 'B-6 롱테일 키워드',
            action: `ROAS ${roas}% 보통 — 핵심 키워드 20~30개에 집중 + 롱테일(세부) 키워드에서 저비용 전환 확보`,
            priority: 'medium',
          });
        }
      }

      // ═══ C등급 규칙 — 손절/재구성 ═══
      else if (spend > 0 || p.abcGrade === 'C') {
        if (spend > 0 && revenue === 0) {
          recs.push({
            rule: 'C-1 광고 중단',
            action: `광고비 ${Math.round(spend).toLocaleString()}원 지출, 전환 0원 — 즉시 OFF. 아이템위너 여부 확인 필수`,
            priority: 'urgent',
          });
          if (spend >= 5000) {
            alertsToCreate.push({
              type: 'strategy_change', severity: 'critical', productId: p.id, companyId,
              title: '광고 중단 권장',
              message: `[광고중단] ${p.name} — 광고비 ${Math.round(spend).toLocaleString()}원 지출, 전환매출 0원`,
            });
          }
        } else if (roas > 0 && roas < 50) {
          recs.push({
            rule: 'C-2 최소 예산',
            action: `ROAS ${roas}% — 일예산 3,000원 축소. 2주 후에도 개선 없으면 OFF`,
            priority: 'high',
          });
        } else if (roas >= 50 && roas < 100) {
          recs.push({
            rule: 'C-2 최소 예산',
            action: `ROAS ${roas}% — 일예산 3,000원 축소 + 롱테일 키워드만 유지`,
            priority: 'high',
          });
        } else if (t14Rev > 0 && spend > t14Rev) {
          recs.push({
            rule: 'C-3 가격 재검토',
            action: `광고비(${Math.round(spend).toLocaleString()}) > 매출(${Math.round(t14Rev).toLocaleString()}) — 판매가 인상 또는 매입가 재협상 필요`,
            priority: 'high',
          });
        }
      }

      if (recs.length > 0) {
        const priOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        recs.sort((a, b) => (priOrder[a.priority] ?? 3) - (priOrder[b.priority] ?? 3));
        const main = recs[0];
        recommendations.push({
          productId: p.id, name: p.name, grade: p.abcGrade, adTier: p.adTier,
          spend, revenue, roas, ctr, cvr, stock, t14Rev,
          rule: main.rule, action: main.action, priority: main.priority,
          additionalRules: recs.length > 1 ? recs.slice(1).map((r) => ({ rule: r.rule, action: r.action, priority: r.priority })) : undefined,
        });
      }
    }

    // 중복 방지: 오늘 이미 생성된 전략 알림 제외
    if (alertsToCreate.length > 0) {
      const existing = await this.prisma.alert.findMany({
        where: { companyId, type: 'strategy_change', createdAt: { gte: todayStart } },
        select: { productId: true },
      });
      const existSet = new Set(existing.map((a) => a.productId));
      const newAlerts = alertsToCreate.filter((a) => !existSet.has(a.productId));
      if (newAlerts.length > 0) {
        await this.prisma.alert.createMany({ data: newAlerts });
      }
    }

    const priOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => ((priOrder[a.priority as string] ?? 3) - (priOrder[b.priority as string] ?? 3)));

    const summary = {
      total: recommendations.length,
      urgent: recommendations.filter((r) => r.priority === 'urgent').length,
      high: recommendations.filter((r) => r.priority === 'high').length,
      medium: recommendations.filter((r) => r.priority === 'medium').length,
      low: recommendations.filter((r) => r.priority === 'low').length,
      newAlerts: alertsToCreate.length,
      wastedSpend: recommendations
        .filter((r) => typeof r.rule === 'string' && (r.rule.includes('광고 중단') || r.rule.includes('전환0')))
        .reduce((s, r) => s + (typeof r.spend === 'number' ? r.spend : 0), 0),
    };

    return { summary, recommendations };
  }

  private getCurrentPeriod(): { year: number; month: number } {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  private async calcActions(companyId: string, year: number, month: number) {
    const config = await this.adConfigService.getConfig(companyId);
    const roasTargets = config.roasTargetByGrade;

    const [adAgg, products, adKeywords] = await Promise.all([
      this.prisma.ad.groupBy({
        by: ['productId'],
        where: { companyId },
        _sum: { spend: true, revenue: true, clicks: true, impressions: true, conversions: true },
      }),
      this.prisma.product.findMany({
        where: { companyId, isDeleted: false },
        select: {
          id: true,
          name: true,
          abcGrade: true,
          adTier: true,
          sellPrice: true,
          costPrice: true,
          profitLoss: {
            where: { companyId, year, month },
            select: { profitRate: true, revenue: true },
            take: 1,
          },
        },
      }),
      this.prisma.ad.findMany({
        where: { companyId, keyword: { not: null } },
        select: { productId: true, keyword: true },
        distinct: ['productId', 'keyword'] as any,
      }),
    ]);

    const adMap = new Map(adAgg.map((a) => [a.productId, a._sum]));

    const keywordMap = new Map<string, string[]>();
    for (const ak of adKeywords) {
      if (!ak.keyword) continue;
      const existing = keywordMap.get(ak.productId) || [];
      if (!existing.includes(ak.keyword)) {
        existing.push(ak.keyword);
        keywordMap.set(ak.productId, existing);
      }
    }

    return products
      .map((p) => {
        const ad = adMap.get(p.id);
        const spend = ad?.spend || 0;
        const adRevenue = ad?.revenue || 0;
        const clicks = ad?.clicks || 0;
        const impressions = ad?.impressions || 0;
        const conversions = ad?.conversions || 0;
        if (spend === 0) return null;

        const roas = (adRevenue / spend) * 100;
        const profitRate = Number(p.profitLoss[0]?.profitRate ?? 0) * 100;
        const totalRevenue = Number(p.profitLoss[0]?.revenue ?? 0);
        const margin = p.sellPrice != null && p.costPrice != null ? p.sellPrice - p.costPrice : 0;
        const grade = p.abcGrade ?? 'C';

        const currentCtr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const currentCvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
        const currentAcos = adRevenue > 0 ? (spend / adRevenue) * 100 : 0;
        const currentAdRate = totalRevenue > 0 ? (spend / totalRevenue) * 100 : 0;

        let action: string;
        let reason: string;
        let actionPriority: 'urgent' | 'high' | 'medium' | 'low';
        if (roas < 100) {
          action = 'stop';
          reason = 'ROAS 100% 미만 — 광고 중단 권장';
          actionPriority = 'urgent';
        } else if (roas < 200) {
          action = 'decrease';
          reason = 'ROAS 200% 미만 — 예산 축소 권장';
          actionPriority = 'high';
        } else if (roas > 400 && profitRate > 10) {
          action = 'increase';
          reason = 'ROAS 400% 초과 + 수익률 10% 초과 — 예산 확대 권장';
          actionPriority = 'low';
        } else {
          action = 'maintain';
          reason = '현재 수준 유지';
          actionPriority = 'medium';
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
          tier: p.adTier ?? null,
          currentRoas: Math.round(roas),
          currentCtr: Math.round(currentCtr * 100) / 100,
          currentCvr: Math.round(currentCvr * 100) / 100,
          currentAcos: Math.round(currentAcos * 100) / 100,
          currentAdRate: Math.round(currentAdRate * 100) / 100,
          recommendedAction: reason,
          actionPriority,
          maxBidPrice: margin > 0 ? Math.round(margin * 0.25) : 0,
          targetRoas: roasTargets[grade] ?? 300,
          keywords: keywordMap.get(p.id) || [],
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
        abcGrade: true,
        adTier: true,
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

    let zeroConversion = 0;
    let lowRoas = 0;
    let cGradeHighTier = 0;
    let aGradeNoAd = 0;

    for (const p of products) {
      const spend = p.ads.reduce((s, a) => s + a.spend, 0);
      const adRevenue = p.ads.reduce((s, a) => s + a.revenue, 0);
      const clicks = p.ads.reduce((s, a) => s + a.clicks, 0);
      const conversions = p.ads.reduce((s, a) => s + a.conversions, 0);

      // 전환 없음: 광고비 지출했는데 전환 0
      if (spend > 0 && conversions === 0) zeroConversion++;

      // 낮은 ROAS: 100% 미만
      if (spend > 0 && adRevenue > 0 && (adRevenue / spend) * 100 < 100) lowRoas++;

      // C등급인데 1차(핵심) 광고
      if (p.abcGrade === 'C' && p.adTier === '1차') cGradeHighTier++;

      // A등급인데 광고 미배정
      if (p.abcGrade === 'A' && !p.adTier && spend === 0) aGradeNoAd++;
    }

    return { zeroConversion, lowRoas, cGradeHighTier, aGradeNoAd };
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
