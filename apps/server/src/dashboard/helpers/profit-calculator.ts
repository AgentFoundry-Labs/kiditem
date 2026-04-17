import type { PrismaService } from '../../prisma/prisma.service';
import { resolvePricing } from '../../common/master-product-resolver';

export interface RangeProfitMetrics {
  revenue: number;
  costOfGoods: number;
  commission: number;
  shippingCost: number;
  adCost: number;
  otherCost: number;
  netProfit: number;
  profitRate: number;
  orderCount: number;
  adRevenue: number;
  adImpressions: number;
  adClicks: number;
  adConversions: number;
}

/**
 * Period profit (Order + Product based, realtime).
 * Extracted from dashboard.service.ts (calculateProfitForRange).
 */
export async function calculateProfitForRange(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<RangeProfitMetrics> {
  const orders = await prisma.order.findMany({
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
    const latestCapturedAt = await prisma.adSnapshot.aggregate({
      where: { source: 'advertising', pageType: 'campaign' },
      _max: { capturedAt: true },
    });

    if (latestCapturedAt._max.capturedAt) {
      const snapshots = await prisma.adSnapshot.findMany({
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
    const adAgg = await prisma.ad.aggregate({
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
  } satisfies RangeProfitMetrics;
}
