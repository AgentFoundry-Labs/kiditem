import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { kstDayStart } from '../common/kst';
import { resolvePricing } from '../common/master-product-resolver';
import type { DashboardSummary, DashboardTrendItem } from '@kiditem/shared';
import type { DateRangeContext, AdMetricsSnapshot, WingMonthlyData, EffectiveMetrics } from './types';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(range?: string, from?: string, to?: string): Promise<DashboardSummary> {
    try {
      const now = new Date();
      const todayStart = kstDayStart(now);
      const todayEnd = new Date(todayStart.getTime() + 86400000);

      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 1);
      const prevMonthDate = new Date(year, month - 2, 1);
      const prevYear = prevMonthDate.getFullYear();
      const prevMonthNum = prevMonthDate.getMonth() + 1;

      const [
        todayAgg,
        monthlyPL,
        gradeRows,
        unreadAlerts,
        allPLCurrentMonth,
        inventoryReorderCount,
        totalActiveProducts,
        plTrend,
        adAggCurrentMonth,
        adAggPrevMonth,
        prevMonthPL,
      ] = await Promise.all([
        this.prisma.coupangOrder.aggregate({
          _sum: { totalPrice: true },
          _count: true,
          where: { orderedAt: { gte: todayStart, lt: todayEnd } },
        }),
        this.prisma.profitLoss.aggregate({
          _sum: { revenue: true, netProfit: true, adCost: true },
          where: { year, month },
        }),
        this.prisma.product.groupBy({
          by: ['abcGrade'],
          _count: true,
          where: { status: 'active' },
        }),
        this.prisma.alert.findMany({
          where: { isRead: false },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.profitLoss.findMany({
          where: { year, month },
        }),
        this.prisma.inventory.count({
          where: {
            currentStock: { gt: 0 },
            reorderPoint: { gt: 0 },
          },
        }),
        this.prisma.product.count({
          where: { status: 'active' },
        }),
        this.prisma.profitLoss.groupBy({
          by: ['year', 'month'],
          _sum: { revenue: true, netProfit: true, adCost: true },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        }),
        this.prisma.$queryRaw<
          { spend: number; impressions: number; clicks: number; revenue: number }[]
        >`
          SELECT
            COALESCE(SUM(spend), 0)::int AS spend,
            COALESCE(SUM(impressions), 0)::int AS impressions,
            COALESCE(SUM(clicks), 0)::int AS clicks,
            COALESCE(SUM(revenue), 0)::int AS revenue
          FROM ads
          WHERE date >= ${monthStart}::date AND date < ${monthEnd}::date
        `,
        this.prisma.$queryRaw<
          { spend: number; impressions: number; clicks: number; revenue: number }[]
        >`
          SELECT
            COALESCE(SUM(spend), 0)::int AS spend,
            COALESCE(SUM(impressions), 0)::int AS impressions,
            COALESCE(SUM(clicks), 0)::int AS clicks,
            COALESCE(SUM(revenue), 0)::int AS revenue
          FROM ads
          WHERE date >= ${prevMonthDate}::date AND date < ${monthStart}::date
        `,
        this.prisma.profitLoss.aggregate({
          _sum: { revenue: true, netProfit: true, adCost: true },
          where: { year: prevYear, month: prevMonthNum },
        }),
      ]);

      const hasPLData = allPLCurrentMonth.length > 0;
      const gradeCount = gradeRows.reduce<Record<string, number>>(
        (acc, g) => ({ ...acc, [g.abcGrade ?? 'C']: g._count }),
        {},
      );

      // reorderPoint 필터링: DB에서 1차 필터 후 앱 레벨에서 정확히 계산
      const needReorder = hasPLData
        ? await this.prisma.inventory
            .findMany({
              where: { currentStock: { gt: 0 } },
              select: { currentStock: true, reorderPoint: true },
            })
            .then(
              (rows) =>
                rows.filter((inv) => inv.currentStock <= inv.reorderPoint)
                  .length,
            )
        : inventoryReorderCount;

      const curAd = adAggCurrentMonth[0] ?? { spend: 0, impressions: 0, clicks: 0, revenue: 0 };
      const prevAd = adAggPrevMonth[0] ?? { spend: 0, impressions: 0, clicks: 0, revenue: 0 };

      const curRoas = Number(curAd.spend) > 0 ? (Number(curAd.revenue) / Number(curAd.spend)) * 100 : 0;
      const curCtr = Number(curAd.impressions) > 0 ? (Number(curAd.clicks) / Number(curAd.impressions)) * 100 : 0;
      const prevRoas = Number(prevAd.spend) > 0 ? (Number(prevAd.revenue) / Number(prevAd.spend)) * 100 : 0;
      const prevCtr = Number(prevAd.impressions) > 0 ? (Number(prevAd.clicks) / Number(prevAd.impressions)) * 100 : 0;

      const adMetrics: AdMetricsSnapshot = {
        roas: Math.round(curRoas * 100) / 100,
        ctr: Math.round(curCtr * 100) / 100,
        adRevenue: 0,       // curMonthProfit으로 보정 (아래)
        totalAdSpend: 0,    // curMonthProfit으로 보정 (아래)
        prevMonthlyRevenue: 0,
        prevMonthlyProfit: 0,
        prevRoas: Math.round(prevRoas * 100) / 100,
        prevCtr: Math.round(prevCtr * 100) / 100,
        prevAdRevenue: Number(prevAd.revenue),
        prevTotalAdSpend: Number(prevAd.spend),
        prevAdRate: 0,      // prevMonthProfit으로 보정 (아래)
      };

      // ── 추가 데이터 쿼리 ────────────────────────────────────────────────────
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const periodStr = `${year}-${String(month).padStart(2, '0')}`;

      // range KPI 기간 계산
      const effectiveRange = range ?? 'month';
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      let dateRange: DateRangeContext;
      if (from && to) {
        const rangeEnd = new Date(to);
        rangeEnd.setDate(rangeEnd.getDate() + 1);
        const duration = rangeEnd.getTime() - new Date(from).getTime();
        dateRange = {
          start: new Date(from),
          end: rangeEnd,
          prevStart: new Date(new Date(from).getTime() - duration),
          prevEnd: new Date(from),
        };
      } else if (effectiveRange === 'week') {
        dateRange = { start: weekStart, end: now, prevStart: prevWeekStart, prevEnd: weekStart };
      } else if (effectiveRange === 'day') {
        dateRange = { start: todayStart, end: todayEnd, prevStart: yesterdayStart, prevEnd: todayStart };
      } else {
        dateRange = { start: monthStart, end: monthEnd, prevStart: prevMonthDate, prevEnd: monthStart };
      }

      const [
        trafficAgg,
        rangeProfitCur,
        rangeProfitPrev,
        rangeAdCur,
        rangeAdPrev,
        dailyOrderRows,
        dailyAdRows,
        salesPlan,
        gradeChangesRows,
        lowCtrProducts,
        lowReviewProducts,
        curMonthProfit,
        prevMonthProfit,
        monthlyTrafficAgg,
        monthlyTrafficCOGSRaw,
      ] = await Promise.all([
        this.prisma.trafficStats.aggregate({
          _sum: {
            visitors: true,
            views: true,
            orders: true,
            salesQty: true,
            revenue: true,
            cartAdds: true,
          },
          // periodDays=1 일별 데이터만 집계 (월/주/일 범위 모두 dateRange 기준)
          where: {
            periodDays: 1,
            date: { gte: dateRange.start, lt: dateRange.end },
          },
        }),
        this.calculateProfitForRange(dateRange.start, dateRange.end),
        this.calculateProfitForRange(dateRange.prevStart, dateRange.prevEnd),
        this.aggregateAdForRange(dateRange.start, dateRange.end),
        this.aggregateAdForRange(dateRange.prevStart, dateRange.prevEnd),
        this.prisma.order.findMany({
          where: {
            orderedAt: { gte: thirtyDaysAgo },
            status: { notIn: ['cancelled', 'returned'] },
          },
          select: { orderedAt: true, totalPrice: true },
        }),
        this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
          SELECT
            TO_CHAR(date, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(spend), 0)::int AS ad_cost
          FROM ads
          WHERE date >= ${thirtyDaysAgo}::date
          GROUP BY 1
          ORDER BY 1
        `,
        this.prisma.salesPlan.findFirst({
          where: { period: periodStr },
        }),
        this.prisma.gradeHistory.findMany({
          where: { calculatedAt: { gte: sevenDaysAgo } },
          select: { oldGrade: true, newGrade: true },
        }),
        // lowCtrProducts: CTR < 1.5% (ctr 필드 Decimal, 0 초과)
        this.prisma.thumbnail.count({
          where: { ctr: { lt: 1.5, gt: 0 } },
        }),
        // lowReviewProducts: A등급 상품 중 리뷰 10개 미만
        this.prisma.product.findMany({
          where: { status: 'active', abcGrade: 'A' },
          include: { _count: { select: { reviews: true } } },
        }).then((products) => products.filter((p) => p._count.reviews < 10).length),
        // 당월/전월 Order 기반 실시간 이익 계산 (summary/comparison/profitDetail용)
        this.calculateProfitForRange(monthStart, monthEnd),
        this.calculateProfitForRange(prevMonthDate, monthStart),
        // Wing 스크래핑 기반 당월 매출: period_days>=14 집계 우선, 없으면 일별 합산
        this.prisma.$queryRaw<{ revenue: bigint; orders: bigint }[]>`
          WITH agg_period AS (
            SELECT DISTINCT ON (product_id) product_id, revenue, orders
            FROM traffic_stats
            WHERE period_days >= 14 AND date >= ${monthStart} AND date < ${monthEnd}
            ORDER BY product_id, period_days DESC, date DESC
          ),
          daily_sum AS (
            SELECT ts.product_id, SUM(ts.revenue)::bigint AS revenue, SUM(ts.orders)::bigint AS orders
            FROM traffic_stats ts
            WHERE ts.period_days = 1 AND ts.date >= ${monthStart} AND ts.date < ${monthEnd}
              AND NOT EXISTS (SELECT 1 FROM agg_period a WHERE a.product_id = ts.product_id)
            GROUP BY ts.product_id
          )
          SELECT COALESCE(SUM(revenue), 0)::bigint AS revenue, COALESCE(SUM(orders), 0)::bigint AS orders
          FROM (SELECT revenue, orders FROM agg_period UNION ALL SELECT revenue, orders FROM daily_sum) t
        `.then(rows => ({ _sum: { revenue: Number(rows[0]?.revenue ?? 0), orders: Number(rows[0]?.orders ?? 0) } })),
        // Wing 스크래핑 기반 당월 원가 (traffic_stats.salesQty × product.costPrice)
        this.prisma.$queryRaw<{ cogs: bigint }[]>`
          SELECT COALESCE(SUM(ts.sales_qty * COALESCE(p.cost_price, 0)), 0) AS cogs
          FROM traffic_stats ts
          JOIN products p ON p.id = ts.product_id
          WHERE ts.period_days = 1
            AND ts.date >= ${monthStart}
            AND ts.date < ${monthEnd}
        `,
      ]);

      // Wing 스크래핑 기반 원가 (traffic_stats × product.costPrice)
      const monthlyTrafficCOGS = Number(monthlyTrafficCOGSRaw[0]?.cogs || 0);

      // profitDetail — Wing adSummary 데이터 우선, 없으면 Order 기반 폴백
      // (나중에 wingAdSummaryRaw 파싱 후 재구성)
      const profitDetail = {
        revenue: curMonthProfit.revenue,
        costOfGoods: monthlyTrafficCOGS > 0 ? monthlyTrafficCOGS : curMonthProfit.costOfGoods,
        commission: 0,       // Wing 기반 계산: adGmv에서 직접 차감
        shippingCost: 0,     // 배송비 미입력 상태: 0 처리
        adCost: curMonthProfit.adCost,
        otherCost: 0,
        netProfit: curMonthProfit.netProfit,
        orderCount: curMonthProfit.orderCount,
      };

      // adMetrics 보정 (curMonthProfit 단일 출처 — wingAdSummary 파싱 후 재보정)
      adMetrics.adRevenue = curMonthProfit.adRevenue;
      adMetrics.totalAdSpend = curMonthProfit.adCost;
      adMetrics.prevMonthlyRevenue = prevMonthProfit.revenue;
      adMetrics.prevMonthlyProfit = prevMonthProfit.netProfit;
      adMetrics.prevAdRate = prevMonthProfit.revenue > 0
        ? Math.round((prevMonthProfit.adCost / prevMonthProfit.revenue) * 1000) / 10 : 0;

      // Wing 스크래핑 기반 당월 매출 (traffic_stats 우선, 없으면 Order 기반 폴백)
      const monthlyTrafficRev = Number(monthlyTrafficAgg._sum.revenue ?? 0);

      // rangeKpi 구성 (calculateProfitForRange + aggregateAdForRange 기반, DB 집계 단일 출처)
      const rangeLabel = from && to ? 'custom' : effectiveRange;
      // month 범위이고 traffic_stats 데이터가 있으면 Wing 스크래핑 값 우선 사용
      const rangeRevenue = (effectiveRange === 'month' && monthlyTrafficRev > 0)
        ? monthlyTrafficRev
        : rangeProfitCur.revenue;
      const prevRangeRevenue = rangeProfitPrev.revenue;

      const curAdSpend = Number(rangeAdCur.spend);
      const prevAdSpend = Number(rangeAdPrev.spend);
      const curAdConvRevenue = Number(rangeAdCur.revenue);
      const prevAdConvRevenue = Number(rangeAdPrev.revenue);
      const curAdRoas = curAdSpend > 0 ? Math.round((curAdConvRevenue / curAdSpend) * 100 * 100) / 100 : 0;
      const prevAdRoas = prevAdSpend > 0 ? Math.round((prevAdConvRevenue / prevAdSpend) * 100 * 100) / 100 : 0;
      const curAdCtr = Number(rangeAdCur.impressions) > 0 ? Math.round((Number(rangeAdCur.clicks) / Number(rangeAdCur.impressions)) * 100 * 100) / 100 : 0;
      const prevAdCtrVal = Number(rangeAdPrev.impressions) > 0 ? Math.round((Number(rangeAdPrev.clicks) / Number(rangeAdPrev.impressions)) * 100 * 100) / 100 : 0;

      const rangeNetProfit = rangeProfitCur.netProfit;
      const rangeAdCostVal = rangeProfitCur.adCost;
      const rangeProfitRate = rangeProfitCur.profitRate;
      const rangeKpi = {
        range: rangeLabel,
        revenue: rangeRevenue,
        profit: rangeNetProfit,
        adSpend: curAdSpend,
        prevRevenue: prevRangeRevenue,
        prevProfit: rangeProfitPrev.netProfit,
        revenueChange: prevRangeRevenue > 0 ? Math.round(((rangeRevenue - prevRangeRevenue) / prevRangeRevenue) * 1000) / 10 : 0,
        profitChange: prevRangeRevenue > 0 ? Math.round(((rangeNetProfit - rangeProfitPrev.netProfit) / Math.abs(rangeProfitPrev.netProfit || 1)) * 1000) / 10 : 0,
        adRoas: curAdRoas,
        adConvRevenue: curAdConvRevenue,
        profitRate: rangeProfitRate,
        adRate: rangeRevenue > 0 ? Math.round((rangeAdCostVal / rangeRevenue) * 1000) / 10 : 0,
        adCost: rangeAdCostVal,
        prevProfitRate: rangeProfitPrev.profitRate,
        prevAdRate: prevRangeRevenue > 0 ? Math.round((rangeProfitPrev.adCost / prevRangeRevenue) * 1000) / 10 : 0,
        prevAdCost: rangeProfitPrev.adCost,
        profitRateChange: Math.round((rangeProfitRate - rangeProfitPrev.profitRate) * 10) / 10,
        adRateChange: Math.round(((rangeRevenue > 0 ? (rangeAdCostVal / rangeRevenue) * 100 : 0) - (prevRangeRevenue > 0 ? (rangeProfitPrev.adCost / prevRangeRevenue) * 100 : 0)) * 10) / 10,
        adCtr: curAdCtr,
        prevAdSpend: prevAdSpend,
        prevAdConvRevenue: prevAdConvRevenue,
        prevAdRoas: prevAdRoas,
        prevAdCtr: prevAdCtrVal,
        adSpendChange: prevAdSpend > 0 ? Math.round(((curAdSpend - prevAdSpend) / prevAdSpend) * 1000) / 10 : 0,
        adConvRevenueChange: prevAdConvRevenue > 0 ? Math.round(((curAdConvRevenue - prevAdConvRevenue) / prevAdConvRevenue) * 1000) / 10 : 0,
        adRoasChange: Math.round((curAdRoas - prevAdRoas) * 100) / 100,
        adCtrChange: Math.round((curAdCtr - prevAdCtrVal) * 100) / 100,
      };

      // trafficKpi — TrafficStats 일별(periodDays=1) 집계를 단일 출처로 사용
      // aggregate 모드: 기간 내 product별 수익 계산
      let trafficNetProfit: number | undefined;
      let trafficProfitRate: number | undefined;
      let trafficCostCoverage: number | undefined;

      {
        // TrafficStats 기반 수익 계산 (aggregate 소스)
        const trafficProductRows = await this.prisma.$queryRaw<
          { product_id: string; revenue: number; sales_qty: number; orders_count: number }[]
        >`
          SELECT product_id, SUM(revenue)::int AS revenue, SUM(sales_qty)::int AS sales_qty,
                 SUM(orders)::int AS orders_count
          FROM traffic_stats
          WHERE period_days = 1 AND date >= ${dateRange.start} AND date < ${dateRange.end}
          GROUP BY product_id
        `;

        if (trafficProductRows.length > 0) {
          const tProductIds = trafficProductRows.map((r) => r.product_id);
          const tProducts = await this.prisma.product.findMany({
            where: { id: { in: tProductIds } },
            select: {
              id: true,
              costPrice: true,
              costCny: true,
              commissionRate: true,
              shippingCost: true,
              masterProduct: { select: { costPrice: true, commissionRate: true } },
            },
          });
          const tProductMap = new Map(tProducts.map((p) => [p.id, p]));

          let totalNP = 0;
          let revenueWithCost = 0;
          const totalRevenue = trafficAgg._sum.revenue ?? 0;

          for (const row of trafficProductRows) {
            const salesQty = Number(row.sales_qty) || 0;
            const rowRevenue = Number(row.revenue) || 0;
            // shippingCost는 주문 단위 고정비 — salesQty(단위) 아닌 orders_count 기준으로 곱해야 과계산 방지
            const ordersCount = Number(row.orders_count) || salesQty;
            if (salesQty === 0) continue;
            const prod = tProductMap.get(row.product_id);
            if (!prod) continue;
            const resolved = resolvePricing(prod);
            const commRate = resolved.commissionRate || 0.108;
            const rowNP =
              rowRevenue -
              resolved.costPrice * salesQty -
              rowRevenue * commRate -
              (prod.shippingCost ? Number(prod.shippingCost) : 0) * ordersCount;
            totalNP += rowNP;
            if (!resolved.isCostMissing) {
              revenueWithCost += rowRevenue;
            }
          }

          trafficNetProfit = Math.round(totalNP);
          trafficProfitRate = totalRevenue > 0 ? Math.round((totalNP / totalRevenue) * 1000) / 10 : 0;
          trafficCostCoverage = totalRevenue > 0 ? Math.round((revenueWithCost / totalRevenue) * 100) / 100 : 0;
        }
      }

      // Wing adSummary — 광고매출(adGmv)/집행광고비(adSpend)/ROAS
      // 이달 1일 시작 + 기간 가장 긴 스냅샷 우선 (일별/부분 스냅샷 제외)
      const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
      const wingAdSnapRows = await this.prisma.$queryRaw<{ raw_json: Record<string, unknown> }[]>`
        SELECT raw_json
        FROM ad_snapshots
        WHERE source = 'wing'
          AND page_type = 'dashboard_kpi'
          AND captured_at >= ${monthStart}
          AND raw_json->>'startDate' = ${monthStartStr}
          AND raw_json->'adSummary'->>'adGmv' IS NOT NULL
          AND (raw_json->'adSummary'->>'adGmv')::float > 0
        ORDER BY (raw_json->>'period')::int DESC, captured_at DESC
        LIMIT 1
      `;
      const wingAdSummaryRaw = wingAdSnapRows[0]?.raw_json
        ? (wingAdSnapRows[0].raw_json as Record<string, unknown>).adSummary ?? null
        : null;

      // Wing 마지막 동기화 시각
      const lastSyncAtRow = await this.prisma.adSnapshot.findFirst({
        where: { source: 'wing' },
        orderBy: { capturedAt: 'desc' },
        select: { capturedAt: true },
      });
      const lastSyncAt = lastSyncAtRow?.capturedAt ?? null;

      // Wing 광고 지표 숫자 파싱 후 profitDetail / adMetrics 재구성
      const wingAdGmv = wingAdSummaryRaw
        ? Math.round(Number((wingAdSummaryRaw as Record<string, unknown>).adGmv) || 0)
        : 0;
      const wingAdSpend = wingAdSummaryRaw
        ? Math.round(Number((wingAdSummaryRaw as Record<string, unknown>).adSpend) || 0)
        : 0;

      if (wingAdGmv > 0) {
        // profitDetail: 총 매출(traffic_stats) 기준 P&L
        // 순이익 = 월매출 - 집행광고비 - 매입가 (수수료·배송비 미입력 시 0)
        const pdRevenue = monthlyTrafficRev > 0 ? monthlyTrafficRev : wingAdGmv;
        profitDetail.revenue = pdRevenue;
        profitDetail.adCost = wingAdSpend;
        profitDetail.shippingCost = 0;
        profitDetail.commission = 0;
        profitDetail.otherCost = 0;
        profitDetail.netProfit = pdRevenue - wingAdSpend - profitDetail.costOfGoods;

        // adMetrics: Wing adSummary 값으로 재보정
        adMetrics.adRevenue = wingAdGmv;
        adMetrics.totalAdSpend = wingAdSpend;

        // rangeKpi: 월 범위일 때 Wing 지표로 재보정
        if (effectiveRange === 'month') {
          (rangeKpi as Record<string, unknown>).adConvRevenue = wingAdGmv;
          (rangeKpi as Record<string, unknown>).adSpend = wingAdSpend;
          const wingRoas = wingAdSpend > 0 ? Math.round((wingAdGmv / wingAdSpend) * 100 * 100) / 100 : 0;
          (rangeKpi as Record<string, unknown>).adRoas = wingRoas;
          // 순이익: 월매출 - 집행광고비 - 매입가
          (rangeKpi as Record<string, unknown>).profit = profitDetail.netProfit;
        }
      }

      const tkVisitors = trafficAgg._sum.visitors ?? 0;
      const tkOrders = trafficAgg._sum.orders ?? 0;
      const tkConversionRate = tkVisitors > 0 ? Math.round((tkOrders / tkVisitors) * 1000) / 10 : 0;

      const trafficKpi = {
        visitors: tkVisitors,
        views: trafficAgg._sum.views ?? 0,
        orders: tkOrders,
        salesQty: trafficAgg._sum.salesQty ?? 0,
        revenue: trafficAgg._sum.revenue ?? 0,
        cartAdds: trafficAgg._sum.cartAdds ?? 0,
        conversionRate: tkConversionRate,
        adSummary: wingAdSummaryRaw,
        source: 'aggregate' as const,
        netProfit: trafficNetProfit,
        profitRate: trafficProfitRate,
        costCoverage: trafficCostCoverage,
        needsScrape: tkVisitors === 0 && (trafficAgg._sum.revenue ?? 0) === 0,
      };

      // adKpi 구성
      const adSpendVal = Number(curAd.spend);
      const adImpVal = Number(curAd.impressions);
      const adClicksVal = Number(curAd.clicks);
      const adConvRevenueVal = Number(curAd.revenue);
      const adConversionsVal = Number(rangeAdCur.conversions ?? 0);
      const adCvrVal = adClicksVal > 0 ? Math.round((adConversionsVal / adClicksVal) * 10000) / 100 : 0;
      const prevAdSpendVal = Number(prevAd.spend);
      const prevAdConvRevenueVal = Number(prevAd.revenue);
      // adKpi — DB 집계 단일 출처
      const adKpi = {
        totalSpend: adSpendVal,
        impressions: adImpVal,
        clicks: adClicksVal,
        convRevenue: adConvRevenueVal,
        ctr: Math.round(curCtr * 100) / 100,
        roas: Math.round(curRoas * 100) / 100,
        conversions: adConversionsVal,
        cvr: adCvrVal,
        prevSpend: prevAdSpendVal,
        prevConvRevenue: prevAdConvRevenueVal,
        prevCtr: Math.round(prevCtr * 100) / 100,
        prevRoas: Math.round(prevRoas * 100) / 100,
        spendChange: prevAdSpendVal > 0 ? Math.round(((adSpendVal - prevAdSpendVal) / prevAdSpendVal) * 1000) / 10 : 0,
        convRevenueChange: prevAdConvRevenueVal > 0 ? Math.round(((adConvRevenueVal - prevAdConvRevenueVal) / prevAdConvRevenueVal) * 1000) / 10 : 0,
        roasChange: Math.round((Math.round(curRoas * 100) / 100 - prevRoas) * 100) / 100,
        ctrChange: Math.round((curCtr - prevCtr) * 100) / 100,
        totalRevenue: curMonthProfit.revenue,
      };

      // comparison 구성 (Order 기반 curMonthProfit/prevMonthProfit)
      const revenueChange = prevMonthProfit.revenue > 0 ? Math.round(((curMonthProfit.revenue - prevMonthProfit.revenue) / prevMonthProfit.revenue) * 1000) / 10 : 0;
      const profitChange = prevMonthProfit.netProfit !== 0 ? Math.round(((curMonthProfit.netProfit - prevMonthProfit.netProfit) / Math.abs(prevMonthProfit.netProfit)) * 1000) / 10 : 0;
      const prevAdRateComp = prevMonthProfit.revenue > 0 ? Math.round((prevMonthProfit.adCost / prevMonthProfit.revenue) * 1000) / 10 : 0;
      const curProfitRate = curMonthProfit.revenue > 0
        ? Math.round((curMonthProfit.netProfit / curMonthProfit.revenue) * 1000) / 10 : 0;
      const prevProfitRateComp = prevMonthProfit.revenue > 0
        ? Math.round((prevMonthProfit.netProfit / prevMonthProfit.revenue) * 1000) / 10 : 0;
      const curAdRateComp = curMonthProfit.revenue > 0
        ? Math.round((curMonthProfit.adCost / curMonthProfit.revenue) * 1000) / 10 : 0;
      const comparison = {
        prevRevenue: prevMonthProfit.revenue,
        prevProfit: prevMonthProfit.netProfit,
        revenueChange,
        profitChange,
        prevAdCost: prevMonthProfit.adCost,
        prevAdRate: prevAdRateComp,
        prevProfitRate: prevProfitRateComp,
        adRateChange: Math.round((curAdRateComp - prevAdRateComp) * 10) / 10,
        profitRateChange: Math.round((curProfitRate - prevProfitRateComp) * 10) / 10,
        adSaving: prevMonthProfit.adCost > 0 && curMonthProfit.adCost < prevMonthProfit.adCost
          ? Math.round(prevMonthProfit.adCost - curMonthProfit.adCost)
          : 0,
      };

      // dailyTrend 구성 (Order에서 일별 집계)
      const dailyRevenueMap = new Map<string, number>();
      for (const order of dailyOrderRows) {
        const dateKey = order.orderedAt.toISOString().slice(0, 10);
        dailyRevenueMap.set(dateKey, (dailyRevenueMap.get(dateKey) ?? 0) + order.totalPrice);
      }
      const dailyAdMap = new Map<string, number>(dailyAdRows.map((r) => [r.date, Number(r.ad_cost)]));
      const allDates = new Set([...dailyRevenueMap.keys(), ...dailyAdMap.keys()]);
      const avgProfitRate = curMonthProfit.revenue > 0
        ? (curMonthProfit.netProfit / curMonthProfit.revenue) * 100 : 0;
      const dailyTrend = Array.from(allDates).sort().map((date) => {
        const rev = dailyRevenueMap.get(date) ?? 0;
        const ad = dailyAdMap.get(date) ?? 0;
        return {
          date,
          revenue: rev,
          adCost: ad,
          profitRate: rev > 0 ? Math.round(avgProfitRate * 10) / 10 : 0,
          adRate: rev > 0 ? Math.round((ad / rev) * 1000) / 10 : 0,
        };
      });

      // planAchievement 구성
      const planAchievement = salesPlan
        ? {
            targetRevenue: salesPlan.targetRevenue,
            actualRevenue: salesPlan.actualRevenue,
            targetOrders: salesPlan.targetOrders,
            actualOrders: salesPlan.actualOrders,
            achieveRate: salesPlan.targetRevenue > 0
              ? Math.round((salesPlan.actualRevenue / salesPlan.targetRevenue) * 1000) / 10
              : 0,
          }
        : null;

      // gradeChanges 구성
      const upgraded = gradeChangesRows.filter((g) => {
        const grades = ['D', 'C', 'B', 'A'];
        return grades.indexOf(g.newGrade) > grades.indexOf(g.oldGrade ?? 'D');
      }).length;
      const downgraded = gradeChangesRows.filter((g) => {
        const grades = ['D', 'C', 'B', 'A'];
        return grades.indexOf(g.newGrade) < grades.indexOf(g.oldGrade ?? 'D');
      }).length;
      const gradeChanges = {
        upgraded,
        downgraded,
        total: gradeChangesRows.length,
      };

      const myAdRateVal = curMonthProfit.revenue > 0
        ? Math.round((curMonthProfit.adCost / curMonthProfit.revenue) * 1000) / 10 : 0;
      const myRoasVal = adMetrics.roas;
      const myCtrVal = adMetrics.ctr;
      const industryBenchmark = {
        avgAdRate: 10,
        avgProfitRate: 8,
        avgRoas: 350,
        avgCtr: 0.3,
        avgCvr: 8,
        myAdRate: myAdRateVal,
        myRoas: myRoasVal,
        myCtr: myCtrVal,
        adRateVsIndustry: myAdRateVal > 0 ? (myAdRateVal > 10 ? 'above' : myAdRateVal < 5 ? 'below' : 'normal') : 'none',
        roasVsIndustry: myRoasVal > 0 ? (myRoasVal > 400 ? 'above' : myRoasVal < 200 ? 'below' : 'normal') : 'none',
      };
      const dataFreshness = {
        lastSync: new Date().toISOString(),
        attributionWindow: '14일',
        attributionWindowDays: 14,
        confirmedUntil: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        note: '광고 전환 데이터는 주문일로부터 14일간 변동될 수 있습니다 (쿠팡 귀속 기간)',
      };

      // profitLoss가 비어있으면 coupang_orders에서 실시간 계산
      if (!hasPLData) {
        const [monthlyOrderAgg, topOrderItems, orderTrend] =
          await Promise.all([
            this.prisma.$queryRaw<
              { revenue: number; order_count: number }[]
            >`
            SELECT
              COALESCE(SUM(total_price), 0)::int AS revenue,
              COUNT(*)::int AS order_count
            FROM coupang_orders
            WHERE ordered_at >= ${monthStart}
              AND ordered_at < ${monthEnd}
          `,
            this.prisma.$queryRaw<
              {
                seller_product_id: string;
                seller_product_name: string;
                revenue: number;
                order_count: number;
              }[]
            >`
            SELECT
              coi.seller_product_id,
              coi.seller_product_name,
              SUM(coi.order_price)::int AS revenue,
              COUNT(DISTINCT co.id)::int AS order_count
            FROM coupang_order_items coi
            JOIN coupang_orders co ON co.id = coi.order_id
            WHERE co.ordered_at >= ${monthStart}
              AND co.ordered_at < ${monthEnd}
              AND coi.seller_product_id IS NOT NULL
            GROUP BY coi.seller_product_id, coi.seller_product_name
            ORDER BY revenue DESC
            LIMIT 10
          `,
            this.prisma.$queryRaw<
              { month_start: Date; revenue: number; order_count: number }[]
            >`
            SELECT
              DATE_TRUNC('month', ordered_at) AS month_start,
              COALESCE(SUM(total_price), 0)::int AS revenue,
              COUNT(*)::int AS order_count
            FROM coupang_orders
            GROUP BY 1
            ORDER BY 1
          `,
          ]);

        const sellerIds = topOrderItems.map((r) => r.seller_product_id);
        const products =
          sellerIds.length > 0
            ? await this.prisma.product.findMany({
                where: { coupangProductId: { in: sellerIds } },
                include: { company: true, masterProduct: true },
              })
            : [];
        const productMap = new Map(
          products.map((p) => [p.coupangProductId, p]),
        );

        const monthlyRevenue = Number(monthlyOrderAgg[0]?.revenue ?? 0);

        return {
          summary: {
            todayRevenue: todayAgg._sum.totalPrice ?? 0,
            todayOrders: todayAgg._count,
            monthlyRevenue: monthlyTrafficRev > 0 ? monthlyTrafficRev : (curMonthProfit.revenue || monthlyRevenue),
            monthlyProfit: profitDetail.netProfit,
            adRate: curMonthProfit.revenue > 0 ? Math.round((curMonthProfit.adCost / curMonthProfit.revenue) * 1000) / 10 : 0,
            totalProducts: totalActiveProducts,
            ...adMetrics,
          },
          gradeCount,
          alerts: unreadAlerts,
          warnings: {
            minusProducts: 0,
            lowProfitProducts: 0,
            highAdProducts: 0,
            needReorder,
            lowCtrProducts,
            lowReviewProducts,
          },
          topProducts: topOrderItems.map((r) => {
            const prod = productMap.get(r.seller_product_id);
            const rev = Number(r.revenue);
            const resolved = prod ? resolvePricing(prod) : { costPrice: 0, sellPrice: 0, commissionRate: 0, isCostMissing: true };
            const rate = resolved.commissionRate || 0.108;
            const comm = Math.round(rev * rate);
            const cnt = Number(r.order_count);
            const cogsVal = resolved.costPrice * cnt;
            const ship = (prod?.shippingCost ?? 0) * cnt;
            const net = rev - comm - cogsVal - ship;

            return {
              id: prod?.id ?? r.seller_product_id,
              name: prod?.name ?? r.seller_product_name,
              company: prod?.company?.name ?? 'N/A',
              grade: prod?.abcGrade ?? 'C',
              revenue: rev,
              netProfit: net,
              profitRate:
                rev > 0 ? Math.round((net / rev) * 1000) / 10 : 0,
            };
          }),
          monthlyTrend: orderTrend.map((m) => {
            const d = new Date(m.month_start);
            return {
              period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
              revenue: Number(m.revenue),
              profit: 0,
              adCost: 0,
            };
          }),
          profitDetail,
          rangeKpi,
          trafficKpi,
          adKpi,
          comparison,
          dailyTrend,
          planAchievement,
          gradeChanges,
          industryBenchmark,
          dataFreshness,
          lastSyncAt,
        } satisfies DashboardSummary;
      }

      // profitLoss 데이터가 있는 경우 (warnings용 PL 분석 + Order 기반 summary)
      const minusProducts = allPLCurrentMonth.filter(
        (pl) => pl.netProfit < 0,
      ).length;

      const lowProfitProducts = allPLCurrentMonth.filter((pl) => {
        const profitRate =
          pl.revenue > 0 ? (pl.netProfit / pl.revenue) * 100 : 0;
        return profitRate >= 0 && profitRate <= 3;
      }).length;

      const highAdProducts = allPLCurrentMonth.filter(
        (pl) =>
          pl.revenue > 0 &&
          pl.adCost > 0 &&
          (pl.adCost / pl.revenue) * 100 > 15,
      ).length;

      const topPLRows = await this.prisma.profitLoss.findMany({
        where: { year, month },
        include: {
          product: {
            include: { company: true },
          },
        },
        orderBy: { netProfit: 'desc' },
        take: 10,
      });

      // 자연매출 음수 경고
      const adConvRevenue = rangeKpi.adConvRevenue;
      if (rangeKpi.revenue - adConvRevenue < 0) {
        this.logger.warn(
          `자연매출 음수: kpiRevenue=${rangeKpi.revenue}, adConvRevenue=${adConvRevenue}, ` +
          `diff=${rangeKpi.revenue - adConvRevenue}, period=${year}-${month}`
        );
      }

      return {
        summary: {
          todayRevenue: todayAgg._sum.totalPrice ?? 0,
          todayOrders: todayAgg._count,
          monthlyRevenue: monthlyTrafficRev > 0 ? monthlyTrafficRev : curMonthProfit.revenue,
          monthlyProfit: profitDetail.netProfit,
          adRate: curMonthProfit.revenue > 0 ? Math.round((curMonthProfit.adCost / curMonthProfit.revenue) * 1000) / 10 : 0,
          totalProducts: totalActiveProducts,
          ...adMetrics,
        },
        gradeCount,
        alerts: unreadAlerts,
        warnings: {
          minusProducts,
          lowProfitProducts,
          highAdProducts,
          needReorder,
          lowCtrProducts,
          lowReviewProducts,
        },
        topProducts: topPLRows.map((tp) => ({
          id: tp.productId,
          name: tp.product?.name ?? 'N/A',
          company: tp.product?.company?.name ?? 'N/A',
          grade: tp.product?.abcGrade ?? 'C',
          revenue: tp.revenue,
          netProfit: tp.netProfit,
          profitRate:
            tp.revenue > 0
              ? Math.round((tp.netProfit / tp.revenue) * 1000) / 10
              : 0,
        })),
        monthlyTrend: plTrend.map((m) => ({
          period: `${m.year}-${String(m.month).padStart(2, '0')}`,
          revenue: m._sum.revenue ?? 0,
          profit: m._sum.netProfit ?? 0,
          adCost: m._sum.adCost ?? 0,
        })),
        profitDetail,
        rangeKpi,
        trafficKpi,
        adKpi,
        comparison,
        dailyTrend,
        planAchievement,
        gradeChanges,
        industryBenchmark,
        dataFreshness,
        lastSyncAt,
      } satisfies DashboardSummary;
    } catch {
      throw new InternalServerErrorException('서버 오류가 발생했습니다.');
    }
  }

  async getTrend(range: string): Promise<DashboardTrendItem[]> {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // 월별 평균 이익률 계산 (ProfitLoss 기준)
    const plAgg = await this.prisma.profitLoss.aggregate({
      _sum: { revenue: true, netProfit: true },
    });
    const avgProfitRate = (plAgg._sum.revenue ?? 0) > 0
      ? (plAgg._sum.netProfit ?? 0) / (plAgg._sum.revenue ?? 1)
      : 0;

    const [orderRows, adRows] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; revenue: number }[]>`
        SELECT
          TO_CHAR(ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
          COALESCE(SUM(total_price), 0)::int AS revenue
        FROM orders
        WHERE ordered_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
        SELECT
          TO_CHAR(date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(spend), 0)::int AS ad_cost
        FROM ads
        WHERE date >= ${since}::date
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const adMap = new Map(adRows.map((r) => [r.date, Number(r.ad_cost)]));

    return orderRows.map((r) => {
      const revenue = Number(r.revenue);
      const profit = Math.round(revenue * avgProfitRate);
      return {
        date: r.date,
        revenue,
        profit,
        adCost: adMap.get(r.date) ?? 0,
      } satisfies DashboardTrendItem;
    });
  }

  /**
   * Wing 월 집계 스냅샷을 조회하고 WingMonthlyData로 파싱.
   * 최근 20개 후보 중 summary 또는 adSummary가 있는 가장 최신 것을 사용.
   * 빈 traffic sync가 섞여도 유의미한 값으로 복원됨.
   */
  private async fetchWingMonthly(monthStart: Date): Promise<WingMonthlyData | null> {
    const wingCandidates = await this.prisma.adSnapshot.findMany({
      where: {
        source: 'wing',
        pageType: 'dashboard_kpi',
        capturedAt: { gte: monthStart },
      },
      orderBy: { capturedAt: 'desc' },
      take: 20,
      select: { rawJson: true, capturedAt: true },
    });
    const wingMonthlySnapshot = wingCandidates.find((s) => {
      const raw = (s.rawJson as Record<string, unknown>) || {};
      return raw.summary != null || raw.adSummary != null;
    }) ?? null;
    if (!wingMonthlySnapshot?.rawJson) return null;
    const raw = wingMonthlySnapshot.rawJson as Record<string, unknown>;
    const summary = (raw.summary as Record<string, unknown>) || null;
    const adSummary = (raw.adSummary as Record<string, unknown>) || null;
    if (!summary && !adSummary) return null;
    const num = (v: unknown) => {
      const n = Number(String(v ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    return {
      revenue: summary ? num(summary.revenue) : 0,
      orders: summary ? num(summary.orders) : 0,
      visitors: summary ? num(summary.visitors) : 0,
      views: summary ? num(summary.views) : 0,
      cartAdds: summary ? num(summary.cartAdds) : 0,
      salesQty: summary ? num(summary.salesQty) : 0,
      conversionRate: summary ? num(summary.conversionRate) : 0,
      adSpend: adSummary ? num(adSummary.adSpend) : 0,
      adGmv: adSummary ? num(adSummary.adGmv) : 0,
      adRoas: adSummary ? num(adSummary.roas) : 0,
      startDate: (raw.startDate as string) || null,
      endDate: (raw.endDate as string) || null,
      capturedAt: wingMonthlySnapshot.capturedAt,
      rawAdSummary: adSummary,
    };
  }

  /**
   * Wing 월 데이터(있으면)로 당월 유효 메트릭을 계산.
   * 매출/광고비는 Wing 단일 출처, 원가류는 calculateProfitForRange 결과 유지.
   */
  private computeEffectiveMetrics(
    wingMonthly: WingMonthlyData | null,
    curMonthProfit: {
      revenue: number;
      adCost: number;
      adRevenue: number;
      orderCount: number;
      costOfGoods: number;
      commission: number;
      shippingCost: number;
      otherCost: number;
      netProfit: number;
    },
  ): EffectiveMetrics {
    const revenue = wingMonthly?.revenue ? wingMonthly.revenue : curMonthProfit.revenue;
    const adCost = wingMonthly?.adSpend ? wingMonthly.adSpend : curMonthProfit.adCost;
    const adRevenue = wingMonthly?.adGmv ? wingMonthly.adGmv : curMonthProfit.adRevenue;
    const orderCount = wingMonthly?.orders ? wingMonthly.orders : curMonthProfit.orderCount;
    const netProfit = wingMonthly
      ? revenue -
        curMonthProfit.costOfGoods -
        curMonthProfit.commission -
        curMonthProfit.shippingCost -
        adCost -
        curMonthProfit.otherCost
      : curMonthProfit.netProfit;
    const adRate = revenue > 0 ? Math.round((adCost / revenue) * 1000) / 10 : 0;
    return { revenue, adCost, adRevenue, orderCount, netProfit, adRate };
  }

  /**
   * 기간별 이익 계산 (Order + Product 기반 실시간)
   * 원본: kiditem_dashboard/src/lib/profit-calculator.ts:182-309
   */
  private async calculateProfitForRange(from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({
      where: {
        orderedAt: { gte: from, lt: to },
        status: { notIn: ['cancelled', 'returned', 'refunded'] },
      },
      select: {
        totalPrice: true,
        quantity: true,
        product: {
          select: {
            costPrice: true,
            costCny: true,
            commissionRate: true,
            shippingCost: true,
            otherCost: true,
            masterProduct: { select: { costPrice: true, commissionRate: true } },
          },
        },
      },
    });

    let revenue = 0;
    let costOfGoods = 0;
    let commission = 0;
    let shippingCost = 0;
    let otherCost = 0;
    let orderCount = 0;

    for (const o of orders) {
      const amt = o.totalPrice || 0;
      const qty = o.quantity || 0;
      const p = o.product;

      revenue += amt;
      orderCount++;

      if (!p) continue; // productId nullable → product null이면 비용 스킵

      const resolved = resolvePricing(p);
      // commissionRate는 Decimal(5,4) = 0.108 (분수). /100 하지 않음
      const commRate = resolved.commissionRate || 0.108;
      costOfGoods += resolved.costPrice * qty;
      commission += amt * commRate;
      shippingCost += p.shippingCost || 0;
      otherCost += (p.otherCost || 0) * qty;
    }

    // 광고비: 현재 기간이면 AdSnapshot → 일할계산, 폴백은 Ad 테이블
    const now = new Date();
    const isCurrentPeriod = from <= now && to > now;

    let adCost = 0;
    let adImpressions = 0;
    let adClicks = 0;
    let adConversions = 0;
    let adRevenue = 0;

    if (isCurrentPeriod) {
      const latestCapturedAt = await this.prisma.adSnapshot.aggregate({
        where: { source: 'advertising', pageType: 'campaign' },
        _max: { capturedAt: true },
      });

      if (latestCapturedAt._max.capturedAt) {
        const snapshots = await this.prisma.adSnapshot.findMany({
          where: {
            source: 'advertising',
            pageType: 'campaign',
            capturedAt: latestCapturedAt._max.capturedAt,
          },
          select: { spend: true, impressions: true, clicks: true, conversions: true, revenue: true },
        });

        const monthlyAdCost = snapshots.reduce((s, r) => s + (r.spend || 0), 0);
        const totalImp = snapshots.reduce((s, r) => s + (r.impressions || 0), 0);
        const totalClk = snapshots.reduce((s, r) => s + (r.clicks || 0), 0);
        const totalConv = snapshots.reduce((s, r) => s + (r.conversions || 0), 0);
        const totalRev = snapshots.reduce((s, r) => s + (r.revenue || 0), 0);

        if (monthlyAdCost > 0) {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const daysElapsed = Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / 86400000));
          const rangeEnd = to > now ? now : to;
          const daysInRange = Math.max(1, Math.ceil((rangeEnd.getTime() - from.getTime()) / 86400000));

          if (daysInRange >= daysElapsed) {
            adCost = monthlyAdCost;
            adImpressions = totalImp;
            adClicks = totalClk;
            adConversions = totalConv;
            adRevenue = totalRev;
          } else {
            const ratio = daysInRange / daysElapsed;
            adCost = Math.round(monthlyAdCost * ratio);
            adImpressions = Math.round(totalImp * ratio);
            adClicks = Math.round(totalClk * ratio);
            adConversions = Math.round(totalConv * ratio);
            adRevenue = Math.round(totalRev * ratio);
          }
        }
      }
    }

    // 폴백: Ad 테이블
    if (adCost === 0) {
      const adAgg = await this.prisma.ad.aggregate({
        where: { date: { gte: from, lt: to } },
        _sum: { spend: true, impressions: true, clicks: true, conversions: true, revenue: true },
      });
      adCost = adAgg._sum.spend || 0;
      adImpressions = adAgg._sum.impressions || 0;
      adClicks = adAgg._sum.clicks || 0;
      adConversions = adAgg._sum.conversions || 0;
      adRevenue = adAgg._sum.revenue || 0;
    }

    const netProfit = revenue - costOfGoods - commission - shippingCost - adCost - otherCost;
    const profitRate = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

    return {
      revenue: Math.round(revenue),
      costOfGoods: Math.round(costOfGoods),
      commission: Math.round(commission),
      shippingCost: Math.round(shippingCost),
      adCost: Math.round(adCost),
      otherCost: Math.round(otherCost),
      netProfit: Math.round(netProfit),
      profitRate,
      orderCount,
      adImpressions,
      adClicks,
      adConversions,
      adRevenue: Math.round(adRevenue),
    };
  }

  /** 기간별 광고 집계 (ads 테이블 raw query) */
  private async aggregateAdForRange(from: Date, to: Date) {
    const agg = await this.prisma.$queryRaw<
      { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }[]
    >`
      SELECT
        COALESCE(SUM(spend), 0)::int AS spend,
        COALESCE(SUM(impressions), 0)::int AS impressions,
        COALESCE(SUM(clicks), 0)::int AS clicks,
        COALESCE(SUM(conversions), 0)::int AS conversions,
        COALESCE(SUM(revenue), 0)::int AS revenue
      FROM ads
      WHERE date >= ${from}::date AND date < ${to}::date
    `;
    return agg[0] ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
  }
}
