import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdConfigService, type AdsConfig } from './ad-config.service';

// ===== 타입 =====
interface ProductAdData {
  id: string;
  name: string;
  abcGrade: string;
  sellPrice: number;
  costPrice: number;
  adTier: string | null;
  adSpend: number;
  adRevenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  netProfit: number;
  reviewCount: number;
}

export interface AdRecommendation {
  productId: string;
  productName: string;
  grade: string;
  tier: string | null;
  currentRoas: number;
  currentCtr: number;
  currentCvr: number;
  currentAcos: number;
  currentAdRate: number;
  recommendedAction: string;
  actionPriority: 'urgent' | 'high' | 'medium' | 'low';
  actionCategory: 'bid' | 'budget' | 'keyword' | 'creative' | 'stop' | 'scale' | 'reduce' | 'optimize';
  reason: string;
  maxBidPrice: number;
  recommendedDailyBudget: number;
  targetRoas: number;
}

// ===== 헬퍼 =====
function calculateMaxBid(sellPrice: number, costPrice: number, targetCvr = 0.1): number {
  const margin = sellPrice > 0 ? (sellPrice - costPrice) / sellPrice : 0;
  const maxBid = sellPrice * margin * targetCvr;
  return Math.round(Math.max(100, Math.min(maxBid, sellPrice * 0.1)));
}

function calculateDailyBudget(sellPrice: number, targetDailySales = 5, targetAdRate = 0.1): number {
  const dailyRevenue = sellPrice * targetDailySales;
  return Math.round(dailyRevenue * targetAdRate);
}

function analyzeProduct(p: ProductAdData, config: AdsConfig): AdRecommendation {
  const ctr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0;
  const cvr = p.clicks > 0 ? (p.conversions / p.clicks) * 100 : 0;
  const roas = p.adSpend > 0 ? (p.adRevenue / p.adSpend) * 100 : 0;
  const acos = p.adRevenue > 0 ? (p.adSpend / p.adRevenue) * 100 : 0;
  const adRate = p.revenue > 0 ? (p.adSpend / p.revenue) * 100 : 0;

  const targetRoas = config.roasTargetByGrade[p.abcGrade] || 300;
  const maxBid = calculateMaxBid(p.sellPrice, p.costPrice);
  const dailyBudget = calculateDailyBudget(p.sellPrice);

  let action = '';
  let priority: AdRecommendation['actionPriority'] = 'medium';
  let category: AdRecommendation['actionCategory'] = 'optimize';
  let reason = '';

  if (p.abcGrade === 'A' && !p.adTier && p.adSpend === 0) {
    action = 'A등급 상품 — 광고 시작 추천 (1차 핵심)';
    priority = 'high';
    category = 'scale';
    reason = `A등급이지만 광고 미진행. 예상 ROAS ${targetRoas}% 이상 가능. 일예산 ${dailyBudget.toLocaleString()}원 추천.`;
  } else if (roas >= 500 && p.adSpend > 0) {
    action = `ROAS ${Math.round(roas)}% 우수 — 예산 증액 추천`;
    priority = 'high';
    category = 'scale';
    reason = `광고 효율 매우 높음. 일예산 50% 증액하면 매출 추가 성장 가능. 현재 ACoS ${acos.toFixed(1)}%.`;
  } else if (roas >= 300 && roas < 500 && p.adSpend > 0) {
    action = `ROAS ${Math.round(roas)}% 양호 — 키워드 최적화`;
    priority = 'low';
    category = 'keyword';
    reason = '목표 ROAS 달성 중. 저성과 키워드 제거로 효율 더 개선 가능.';
  } else if (roas >= 200 && roas < 300 && p.adSpend > 0) {
    action = `ROAS ${Math.round(roas)}% 주의 — 입찰가 하향 검토`;
    priority = 'medium';
    category = 'bid';
    reason = `목표 ROAS(${targetRoas}%) 미달. 입찰가를 ${maxBid}원 이하로 조정 추천. CTR ${ctr.toFixed(1)}%, CVR ${cvr.toFixed(1)}%.`;
  } else if (roas > 0 && roas < 200 && p.adSpend > 0) {
    action = `ROAS ${Math.round(roas)}% 위험 — 광고비 절감 또는 중단`;
    priority = 'urgent';
    category = 'reduce';
    reason = `광고비 대비 매출 부족. 입찰가 대폭 하향 또는 광고 중단 검토. ACoS ${acos.toFixed(1)}%.`;
  } else if (p.adSpend > 0 && p.adRevenue === 0) {
    action = '광고 매출 0원 — 즉시 중단';
    priority = 'urgent';
    category = 'stop';
    reason = `${p.adSpend.toLocaleString()}원 지출했으나 전환 없음. 상세페이지/가격/리뷰 점검 후 재시작.`;
  } else if (ctr > 0 && ctr < 1.5 && p.impressions > 100) {
    action = `CTR ${ctr.toFixed(1)}% 저조 — 썸네일/상품명 개선`;
    priority = 'medium';
    category = 'creative';
    reason = '노출 대비 클릭 부족. 메인 이미지, 상품명, 가격 경쟁력 점검 필요.';
  } else if (cvr > 0 && cvr < 5 && p.clicks > 20) {
    action = `CVR ${cvr.toFixed(1)}% 저조 — 상세페이지/가격 개선`;
    priority = 'medium';
    category = 'creative';
    reason = `클릭 대비 구매 전환 부족. 상세페이지 품질, 가격, 리뷰(현재 ${p.reviewCount}개) 점검.`;
  } else if (adRate > config.adRate.thresholds.warning && p.adSpend > 0) {
    action = `광고비율 ${adRate.toFixed(1)}% — ${config.adRate.thresholds.warning}% 이하로 절감`;
    priority = 'high';
    category = 'reduce';
    reason = '매출 대비 광고비 과다. 입찰가 하향 + 네거티브 키워드 정리 필요.';
  } else if (p.abcGrade === 'C' && p.adTier === '1차') {
    action = 'C등급에 1차(핵심) 광고 — 등급 하향';
    priority = 'high';
    category = 'reduce';
    reason = 'C등급 상품에 핵심 예산 배정은 비효율적. 3차 테스트로 전환하거나 중단.';
  } else {
    action = '현재 상태 유지';
    priority = 'low';
    category = 'optimize';
    reason = '특별한 조치 불필요. 정기 모니터링 권장.';
  }

  return {
    productId: p.id, productName: p.name, grade: p.abcGrade, tier: p.adTier,
    currentRoas: Math.round(roas), currentCtr: Math.round(ctr * 10) / 10,
    currentCvr: Math.round(cvr * 10) / 10, currentAcos: Math.round(acos * 10) / 10,
    currentAdRate: Math.round(adRate * 10) / 10,
    recommendedAction: action, actionPriority: priority, actionCategory: category, reason,
    maxBidPrice: maxBid, recommendedDailyBudget: dailyBudget, targetRoas,
  };
}

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

  async getRules() {
    try {
      const companyId = await this.getDefaultCompanyId();

      const adAgg = await this.prisma.ad.groupBy({
        by: ['productId'],
        where: { companyId },
        _sum: { spend: true, revenue: true, clicks: true, impressions: true, conversions: true },
      });

      const products = await this.prisma.product.findMany({
        where: { companyId, isDeleted: false },
        include: {
          inventory: true,
          trafficStats: { where: { periodDays: 14 }, orderBy: { date: 'desc' }, take: 1 },
        },
      });

      const adMap = new Map(adAgg.map((a) => [a.productId, a._sum]));
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const recommendations: Array<{
        productId: string; name: string; grade: string | null; adTier: string | null;
        spend: number; revenue: number; roas: number; ctr: number; cvr: number;
        stock: number; t14Rev: number;
        rule: string; action: string; priority: string;
        additionalRules?: Array<{ rule: string; action: string; priority: string }>;
      }> = [];
      const alertsToCreate: Array<{ type: string; productId: string; message: string; title: string; companyId: string; severity: string }> = [];

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
        const stock = p.inventory?.currentStock || 0;
        const t14Rev = p.trafficStats?.[0]?.revenue || 0;
        const margin = p.sellPrice && p.costPrice ? p.sellPrice - p.costPrice : 0;
        const adBudgetLimit = margin > 0 ? margin * 0.35 : 0;

        const recs: Array<{ rule: string; action: string; priority: string }> = [];

        // 공통 긴급 규칙
        if (stock === 0 && p.adTier && spend > 0) {
          recs.push({ rule: '긴급: 재고0 광고ON', action: '재고 없음 — 광고 즉시 중단. 재입고 확인 후 재개', priority: 'urgent' });
          alertsToCreate.push({ type: 'strategy_change', productId: p.id, message: `[긴급] ${p.name} — 재고 0인데 광고 ON, 즉시 중단 필요`, title: '긴급: 재고0 광고ON', companyId, severity: 'warning' });
        }

        if (clicks >= 50 && conversions === 0 && spend > 0) {
          recs.push({ rule: 'C-5 전환0 조기손절', action: `클릭 ${clicks}회, 전환 0 — 키워드 OFF 또는 캠페인 중단 (광고비 ${Math.round(spend).toLocaleString()}원 낭비)`, priority: 'urgent' });
          if (spend >= 3000) {
            alertsToCreate.push({ type: 'strategy_change', productId: p.id, message: `[조기손절] ${p.name} — 클릭 ${clicks}회 전환 0, 광고비 ${Math.round(spend).toLocaleString()}원 낭비`, title: 'C-5 전환0 조기손절', companyId, severity: 'warning' });
          }
        }

        if (ctr >= 0.5 && roas < 100 && spend > 1000 && clicks >= 20) {
          recs.push({ rule: 'B-7 CTR높음 전환낮음', action: `CTR ${ctr}% (양호) but ROAS ${roas}% (저조) — 썸네일은 OK, 상세페이지·가격·리뷰 재검토`, priority: 'high' });
          alertsToCreate.push({ type: 'strategy_change', productId: p.id, message: `[상세페이지] ${p.name} — CTR ${ctr}% 양호하나 전환 저조(ROAS ${roas}%), 상세페이지/가격 점검`, title: 'B-7 CTR높음 전환낮음', companyId, severity: 'warning' });
        }

        if (adBudgetLimit > 0 && spend > adBudgetLimit * 14 && roas < 300) {
          recs.push({ rule: '순이익 한도 초과', action: `광고비 ${Math.round(spend).toLocaleString()}원 > 순이익 한도 ${Math.round(adBudgetLimit * 14).toLocaleString()}원 — 예산 축소 또는 ROAS 목표 상향`, priority: 'high' });
        }

        // A등급 규칙
        if (p.abcGrade === 'A' || t14Rev > 50000) {
          if (roas >= 480 && spend > 0) {
            recs.push({ rule: 'A-1 매출 확대', action: `ROAS ${roas}% — 일예산 20% 증액 추천. 입찰가 10% 인상 검토`, priority: 'high' });
          } else if (roas >= 300 && ctr >= 0.3) {
            recs.push({ rule: 'A-2 키워드 확장', action: `ROAS ${roas}% + CTR ${ctr}% — ${p.adTier || '없음'}→1차 승격. 매출최적화에서 발굴된 키워드를 수동 캠페인에 추가`, priority: 'high' });
          } else if (roas < 200 && spend > 3000) {
            recs.push({ rule: 'A-3 위험 감지', action: `A등급 ROAS ${roas}%로 하락 — 입찰가 15% 하향 + 전환 0 키워드 제외 등록 + 아이템위너 상태 확인`, priority: 'urgent' });
            alertsToCreate.push({ type: 'strategy_change', productId: p.id, message: `[전략수정] ${p.name} — A등급 ROAS ${roas}%로 하락, 아이템위너 확인 및 입찰가 조정 필요`, title: 'A-3 위험 감지', companyId, severity: 'warning' });
          } else if (!p.adTier && t14Rev > 30000) {
            recs.push({ rule: 'A-4 신규 광고', action: `자연매출 ${Math.round(t14Rev).toLocaleString()}원 — 매출최적화 광고 먼저 시작 (ROAS 300~350%, 일예산 3만원). 7~14일 최적화 후 수동 캠페인 병행`, priority: 'medium' });
          }
          if (p.adTier && roas >= 300 && spend > 0) {
            recs.push({ rule: 'A-5 매출최적화 병행', action: `수동 캠페인 ROAS ${roas}% 안정 — 매출최적화 캠페인 추가 개설로 신규 키워드 발굴 추천`, priority: 'low' });
          }
        }
        // B등급 규칙
        else if (p.abcGrade === 'B' || (roas >= 100 && roas < 480)) {
          if (roas >= 480) {
            recs.push({ rule: 'B-5 A승격', action: `ROAS ${roas}% — A등급 캠페인으로 이동. 예산 비중 확대 (60~70% 목표)`, priority: 'high' });
            alertsToCreate.push({ type: 'strategy_change', productId: p.id, message: `[A승격] ${p.name} — ROAS ${roas}% 달성, A등급 캠페인 이동 추천`, title: 'B-5 A승격', companyId, severity: 'warning' });
          } else if (roas >= 300) {
            recs.push({ rule: 'B-3 예산 유지', action: `ROAS ${roas}% 안정 — 현재 예산 유지, 주간 모니터링. 제외 키워드 정리 추천`, priority: 'low' });
          } else if (roas >= 100 && ctr < 0.15) {
            recs.push({ rule: 'B-2 소재 테스트', action: `CTR ${ctr}% 미달 — 썸네일 교체 추천. 경쟁사 상위 3개 썸네일 벤치마킹 후 A/B 테스트`, priority: 'medium' });
          } else if (roas >= 100 && roas < 200) {
            recs.push({ rule: 'B-4 입찰가 하향', action: `ROAS ${roas}% — 입찰가 15% 하향. 메인 키워드 경쟁 과열이면 롱테일 키워드(100~300원)로 전환`, priority: 'medium' });
          } else if (roas >= 200) {
            recs.push({ rule: 'B-6 롱테일 키워드', action: `ROAS ${roas}% 보통 — 핵심 키워드 20~30개에 집중 + 롱테일(세부) 키워드에서 저비용 전환 확보`, priority: 'medium' });
          }
        }
        // C등급 규칙
        else if (spend > 0 || p.abcGrade === 'C') {
          if (spend > 0 && revenue === 0) {
            recs.push({ rule: 'C-1 광고 중단', action: `광고비 ${Math.round(spend).toLocaleString()}원 지출, 전환 0원 — 즉시 OFF. 아이템위너 여부 확인 필수`, priority: 'urgent' });
            if (spend >= 5000) {
              alertsToCreate.push({ type: 'strategy_change', productId: p.id, message: `[광고중단] ${p.name} — 광고비 ${Math.round(spend).toLocaleString()}원 지출, 전환매출 0원`, title: 'C-1 광고 중단', companyId, severity: 'warning' });
            }
          } else if (roas > 0 && roas < 50) {
            recs.push({ rule: 'C-2 최소 예산', action: `ROAS ${roas}% — 일예산 3,000원 축소. 2주 후에도 개선 없으면 OFF`, priority: 'high' });
          } else if (roas >= 50 && roas < 100) {
            recs.push({ rule: 'C-2 최소 예산', action: `ROAS ${roas}% — 일예산 3,000원 축소 + 롱테일 키워드만 유지`, priority: 'high' });
          } else if (t14Rev > 0 && spend > t14Rev) {
            recs.push({ rule: 'C-3 가격 재검토', action: `광고비(${Math.round(spend).toLocaleString()}) > 매출(${Math.round(t14Rev).toLocaleString()}) — 판매가 인상 또는 매입가 재협상 필요`, priority: 'high' });
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
            additionalRules: recs.length > 1 ? recs.slice(1) : undefined,
          });
        }
      }

      // Alert 중복 방지
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

      const summary = {
        total: recommendations.length,
        urgent: recommendations.filter((r) => r.priority === 'urgent').length,
        high: recommendations.filter((r) => r.priority === 'high').length,
        medium: recommendations.filter((r) => r.priority === 'medium').length,
        low: recommendations.filter((r) => r.priority === 'low').length,
        newAlerts: alertsToCreate.length,
        wastedSpend: recommendations
          .filter((r) => r.rule.includes('광고 중단') || r.rule.includes('전환0'))
          .reduce((s, r) => s + r.spend, 0),
      };

      const priOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

      return {
        summary,
        recommendations: recommendations.sort(
          (a, b) => (priOrder[a.priority] ?? 3) - (priOrder[b.priority] ?? 3),
        ),
      };
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('광고 전략 분석 실패');
    }
  }

  async getWeeklyPlan() {
    try {
      const companyId = await this.getDefaultCompanyId();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const productsData = await this.prisma.product.findMany({
        where: { companyId, isDeleted: false, adTier: { not: null } },
        include: {
          company: true,
          profitLoss: { where: { year, month }, take: 1 },
          reviews: { select: { id: true } },
        },
      });

      const adAgg = await this.prisma.ad.groupBy({
        by: ['productId'],
        where: { companyId },
        _sum: { spend: true, revenue: true, impressions: true, clicks: true, conversions: true },
      });
      const adMap = new Map(adAgg.map((a) => [a.productId, a._sum]));

      const config = await this.adConfigService.getConfig(companyId);

      const productAdData: ProductAdData[] = productsData.map((p) => {
        const ad = adMap.get(p.id);
        const pl = p.profitLoss?.[0];
        return {
          id: p.id,
          name: p.name,
          abcGrade: p.abcGrade || 'C',
          sellPrice: p.sellPrice || 0,
          costPrice: p.costPrice || 0,
          adTier: p.adTier,
          adSpend: ad?.spend || 0,
          adRevenue: ad?.revenue || 0,
          impressions: ad?.impressions || 0,
          clicks: ad?.clicks || 0,
          conversions: ad?.conversions || 0,
          revenue: pl?.revenue || 0,
          netProfit: pl?.netProfit || 0,
          reviewCount: p.reviews?.length || 0,
        };
      });

      const actions = productAdData.map((p) => analyzeProduct(p, config));
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      actions.sort((a, b) => priorityOrder[a.actionPriority] - priorityOrder[b.actionPriority]);

      const summary = {
        scaleUp: actions.filter((a) => a.actionCategory === 'scale').length,
        optimize: actions.filter((a) => a.actionCategory === 'keyword' || a.actionCategory === 'creative').length,
        reduce: actions.filter((a) => a.actionCategory === 'reduce' || a.actionCategory === 'bid').length,
        stop: actions.filter((a) => a.actionCategory === 'stop').length,
        newStart: actions.filter((a) => a.actionCategory === 'scale' && !a.tier).length,
      };

      const totalSpend = productAdData.reduce((s, p) => s + p.adSpend, 0);
      const gradeSpend: Record<string, number> = { A: 0, B: 0, C: 0 };
      productAdData.forEach((p) => {
        gradeSpend[p.abcGrade] = (gradeSpend[p.abcGrade] || 0) + p.adSpend;
      });

      const allocation = config.budget.allocation;
      const budgetAllocation = ['A', 'B', 'C'].map((g) => ({
        grade: g,
        currentPercent: totalSpend > 0 ? Math.round((gradeSpend[g] / totalSpend) * 100) : 0,
        targetPercent: allocation[g] || 0,
        gap: totalSpend > 0
          ? Math.round((gradeSpend[g] / totalSpend) * 100) - (allocation[g] || 0)
          : 0,
      }));

      const totalAdSpend = productAdData.reduce((s, p) => s + p.adSpend, 0);
      const totalAdRevenue = productAdData.reduce((s, p) => s + p.adRevenue, 0);
      const totalImpressions = productAdData.reduce((s, p) => s + p.impressions, 0);
      const totalClicks = productAdData.reduce((s, p) => s + p.clicks, 0);
      const totalConversions = productAdData.reduce((s, p) => s + p.conversions, 0);

      const tierSpend: Record<string, number> = { '1차': 0, '2차': 0, '3차': 0 };
      const tierCount: Record<string, number> = { '1차': 0, '2차': 0, '3차': 0 };
      productAdData.forEach((p) => {
        if (p.adTier && tierSpend[p.adTier] !== undefined) {
          tierSpend[p.adTier] += p.adSpend;
          tierCount[p.adTier]++;
        }
      });
      const tierAnalysis = Object.entries(config.tier.dailyBudget).map(([tier, target]) => ({
        tier,
        count: tierCount[tier] || 0,
        currentSpend: Math.round(tierSpend[tier] || 0),
        targetDailyBudget: target,
        gap: Math.round((tierSpend[tier] || 0) - target),
        overBudget: (tierSpend[tier] || 0) > target,
      }));

      const sortedByRevenue = [...productAdData].sort((a, b) => b.revenue - a.revenue);
      const top20Count = Math.max(1, Math.ceil(productAdData.length * 0.2));
      const top20Products = sortedByRevenue.slice(0, top20Count);
      const top20Spend = top20Products.reduce((s, p) => s + p.adSpend, 0);
      const top20Concentration = totalSpend > 0 ? Math.round((top20Spend / totalSpend) * 100) : 0;

      const adIssues = {
        zeroConversion: productAdData.filter((p) => p.adSpend > 0 && p.adRevenue === 0).length,
        lowRoas: productAdData.filter((p) => p.adSpend > 0 && p.adRevenue > 0 && (p.adRevenue / p.adSpend) * 100 < 200).length,
        cGradeHighTier: productAdData.filter((p) => p.abcGrade === 'C' && p.adTier === '1차').length,
        aGradeNoAd: productAdData.filter((p) => p.abcGrade === 'A' && !p.adTier && p.adSpend === 0).length,
      };

      return {
        generatedAt: new Date().toISOString(),
        totalProducts: productAdData.length,
        summary,
        actions: actions.filter((a) => a.actionPriority !== 'low').slice(0, 50),
        budgetAllocation,
        tierAnalysis,
        top20: { count: top20Count, spend: Math.round(top20Spend), concentration: top20Concentration, target: 80 },
        adIssues,
        keyMetrics: {
          totalAdSpend,
          totalAdRevenue,
          overallRoas: totalAdSpend > 0 ? Math.round((totalAdRevenue / totalAdSpend) * 100) : 0,
          overallAcos: totalAdRevenue > 0 ? Math.round((totalAdSpend / totalAdRevenue) * 100) : 0,
          avgCtr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0,
          avgCvr: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 1000) / 10 : 0,
        },
      };
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('주간 액션 플랜 생성 실패');
    }
  }

  async getRecommendations() {
    try {
      const companyId = await this.getDefaultCompanyId();

      const products = await this.prisma.product.findMany({
        where: { companyId, isDeleted: false },
        include: {
          ads: { orderBy: { date: 'desc' }, take: 30 },
          trafficStats: { where: { periodDays: 14 }, orderBy: { date: 'desc' }, take: 1 },
          inventory: { select: { currentStock: true } },
        },
      });

      const productAds = products.map((p) => {
        const spend = p.ads.reduce((s, a) => s + a.spend, 0);
        const rev = p.ads.reduce((s, a) => s + a.revenue, 0);
        const clicks = p.ads.reduce((s, a) => s + a.clicks, 0);
        const impressions = p.ads.reduce((s, a) => s + a.impressions, 0);
        const roas = spend > 0 ? Math.round((rev / spend) * 100) : 0;
        const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
        const t14Rev = p.trafficStats?.[0]?.revenue || 0;
        const stock = p.inventory?.currentStock || 0;
        return { id: p.id, name: p.name, category: p.category || '', adTier: p.adTier, spend, rev, roas, ctr, clicks, impressions, t14Rev, stock, sellPrice: p.sellPrice || 0 };
      });

      const cards: Array<{
        title: string;
        icon: string;
        color: string;
        items: Array<{ text: string; productName?: string; value?: string; priority: string }>;
      }> = [];

      // 1. ROAS 폭발 상품
      const highRoas = productAds.filter((pa) => pa.roas >= 500 && pa.spend > 1000).sort((a, b) => b.roas - a.roas).slice(0, 5);
      if (highRoas.length > 0) {
        cards.push({
          title: 'ROAS 폭발 — 즉시 예산 증액', icon: 'rocket', color: 'from-green-50 to-emerald-50 border-green-300',
          items: highRoas.map((pa) => ({ text: `ROAS ${pa.roas}% → 일예산 20% 증액 추천`, productName: pa.name.substring(0, 25), value: `광고비 ${Math.round(pa.spend).toLocaleString()}원 → 매출 ${Math.round(pa.rev).toLocaleString()}원`, priority: 'high' })),
        });
      }

      // 2. 광고비 낭비
      const wasted = productAds.filter((pa) => pa.spend > 500 && pa.rev === 0).sort((a, b) => b.spend - a.spend).slice(0, 5);
      if (wasted.length > 0) {
        cards.push({
          title: '광고비 낭비 — 즉시 중단', icon: 'alert', color: 'from-red-50 to-pink-50 border-red-300',
          items: wasted.map((pa) => ({ text: `광고비 ${Math.round(pa.spend).toLocaleString()}원 지출, 전환 0원`, productName: pa.name.substring(0, 25), value: '캠페인 OFF 권장', priority: 'urgent' })),
        });
      }

      // 3. 자연매출 우수 — 광고 없음
      const naturalHigh = productAds.filter((pa) => !pa.adTier && pa.t14Rev > 20000).sort((a, b) => b.t14Rev - a.t14Rev).slice(0, 5);
      if (naturalHigh.length > 0) {
        cards.push({
          title: '자연매출 우수 — 광고 테스트 추천', icon: 'gem', color: 'from-blue-50 to-indigo-50 border-blue-300',
          items: naturalHigh.map((pa) => ({ text: `14일 매출 ${Math.round(pa.t14Rev).toLocaleString()}원 (광고 없이)`, productName: pa.name.substring(0, 25), value: '광고 시작 시 매출 폭발 가능', priority: 'high' })),
        });
      }

      // 4. 재고 0 + 광고 ON
      const noStock = productAds.filter((pa) => pa.stock === 0 && pa.adTier && pa.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 5);
      if (noStock.length > 0) {
        cards.push({
          title: '재고 없음 + 광고 ON — 즉시 중단', icon: 'warning', color: 'from-orange-50 to-amber-50 border-orange-300',
          items: noStock.map((pa) => ({ text: `재고 0개인데 광고비 ${Math.round(pa.spend).toLocaleString()}원 지출 중`, productName: pa.name.substring(0, 25), value: '광고 즉시 OFF 필요', priority: 'urgent' })),
        });
      }

      // 5. 카테고리별 성과
      const catMap = new Map<string, { count: number; totalRev: number; totalSpend: number }>();
      productAds.forEach((pa) => {
        if (!pa.category || pa.category === '-') return;
        const shortCat = pa.category.split('/').slice(0, 2).join('/');
        const existing = catMap.get(shortCat) || { count: 0, totalRev: 0, totalSpend: 0 };
        existing.count++;
        existing.totalRev += pa.t14Rev;
        existing.totalSpend += pa.spend;
        catMap.set(shortCat, existing);
      });
      const topCats = [...catMap.entries()].sort((a, b) => b[1].totalRev - a[1].totalRev).slice(0, 5);
      if (topCats.length > 0) {
        cards.push({
          title: '카테고리별 매출 — 집중 투자 대상', icon: 'package', color: 'from-slate-50 to-gray-50 border-slate-300',
          items: topCats.map(([cat, data]) => ({ text: `${data.count}개 상품, 14일 매출 ${Math.round(data.totalRev).toLocaleString()}원`, productName: cat, value: data.totalSpend > 0 ? `광고비 ${Math.round(data.totalSpend).toLocaleString()}원` : '광고 미집행', priority: 'medium' })),
        });
      }

      // 6. CTR 높은데 전환 낮음
      const highCtrLowConv = productAds.filter((pa) => pa.ctr > 0.5 && pa.roas < 100 && pa.spend > 1000).sort((a, b) => b.ctr - a.ctr).slice(0, 5);
      if (highCtrLowConv.length > 0) {
        cards.push({
          title: 'CTR 높은데 전환 낮음 — 상세페이지 개선', icon: 'image', color: 'from-cyan-50 to-sky-50 border-cyan-300',
          items: highCtrLowConv.map((pa) => ({ text: `CTR ${pa.ctr}% (좋음) but ROAS ${pa.roas}% (낮음)`, productName: pa.name.substring(0, 25), value: '상세페이지/가격 재검토', priority: 'medium' })),
        });
      }

      // 7. 가격대별 전략
      const priceGroups = [
        { label: '1,000원 미만', min: 0, max: 1000 },
        { label: '1,000~3,000원', min: 1000, max: 3000 },
        { label: '3,000~10,000원', min: 3000, max: 10000 },
        { label: '10,000원 이상', min: 10000, max: 999999 },
      ];
      const priceItems = priceGroups.map((g) => {
        const group = productAds.filter((pa) => pa.sellPrice >= g.min && pa.sellPrice < g.max && pa.spend > 0);
        const avgRoas = group.length > 0 ? Math.round(group.reduce((s, pa) => s + pa.roas, 0) / group.length) : 0;
        return { text: `${group.length}개 상품, 평균 ROAS ${avgRoas}%`, productName: g.label, value: avgRoas >= 300 ? '광고 유지' : avgRoas >= 100 ? '키워드 최적화' : avgRoas > 0 ? '광고 축소 검토' : '-', priority: avgRoas >= 300 ? 'low' : 'medium' };
      }).filter((i) => !i.text.includes('0개'));
      if (priceItems.length > 0) {
        cards.push({
          title: '가격대별 광고 효율', icon: 'coins', color: 'from-amber-50 to-yellow-50 border-amber-300',
          items: priceItems,
        });
      }

      const plan = await this.getWeeklyPlan();

      return { cards, keyMetrics: plan.keyMetrics };
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('전략 추천 카드 생성 실패');
    }
  }
}
