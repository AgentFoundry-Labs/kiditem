import { recomputeRoas } from '../util/ratio-recompute';
import type { AdActionTargetType } from '../services/types';
import type { LatestTargetRow } from '../read-models/ad-action-read-model';

/**
 * Pure 5-rule selector for `AdAction` candidates.
 *
 * The 5 rules over `ChannelAdTargetDailySnapshot` are documented in
 * `apps/server/src/advertising/CLAUDE.md` ("AdAction 규칙"). This module
 * holds the pure decision logic only — it does not touch Prisma or any
 * tenant-scoped service. `AdActionService` orchestrates the read of latest
 * target-daily rows + option-daily stock map and feeds rows in here.
 */

export type ActionCandidate = {
  adTargetDailyId: string;
  listingId: string | null;
  actionType: string;
  targetType: AdActionTargetType;
  externalId: string | null;
  targetLabel: string;
  reason: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  currentValue: number | null;
  proposedValue: number | null;
  payload: Record<string, unknown>;
};

/**
 * Derive a candidate from one latest target-daily row. Implements the 5
 * rules over the target-daily column shape.
 *
 * `optionDailyStockMap` provides the latest channel-observed `stockQty` per
 * `listingOptionId` so Rule 1 can fire even when the in-memory live
 * `ProductOption.availableStock` is non-zero (channel may have observed
 * sold-out before our internal counter updated).
 */
export function createActionCandidate(
  row: LatestTargetRow,
  optionDailyStockMap: Map<string, number | null>,
): ActionCandidate | null {
  const grade = row.abcGrade || 'C';
  // Per-row ROAS for rule decisions — daily target row holds today's revenue
  // and spend for the (campaign|keyword|product) at this grain. Recompute
  // from the row's own numerator/denominator (do not trust any provider
  // ratio that may live in metaJson).
  const roas = recomputeRoas(row.revenue, row.spend) ?? 0;
  const profitRateNum = calcProfitRate({
    costPrice: row.optionCostPrice,
    sellPrice: row.optionSellPrice,
    commissionRate: row.optionCommissionRate,
  });
  const targetLabel =
    row.keyword ||
    row.campaignName ||
    row.productName ||
    row.externalId ||
    '미식별 대상';
  const statusText = (row.status || '').toLowerCase();

  // Rule 1: zero stock → budget cut (option-stock not observable → skip)
  if (
    row.targetType === 'campaign' &&
    row.dailyBudget != null &&
    row.dailyBudget > 0 &&
    row.listingOptionId !== null
  ) {
    const observedStockQty = optionDailyStockMap.has(row.listingOptionId)
      ? optionDailyStockMap.get(row.listingOptionId)
      : undefined;
    const liveStock = row.optionAvailableStock;
    // Rule fires when EITHER the live internal stock OR the latest daily
    // observed channel stock is exactly 0. (`null`/undefined means "not
    // observed" → don't fire.)
    const liveZero = liveStock === 0;
    const observedZero = observedStockQty === 0;
    if (liveZero || observedZero) {
      return {
        adTargetDailyId: row.id,
        listingId: row.listingId,
        actionType: 'change_daily_budget',
        targetType: 'campaign',
        externalId: row.externalId,
        targetLabel,
        reason: `재고 0개인데 광고 예산 ${formatNumber(row.dailyBudget)}원이 유지 중입니다. 즉시 축소가 필요합니다.`,
        priority: 'urgent',
        currentValue: row.dailyBudget,
        proposedValue: 3000,
        payload: basePayload(row, { pageType: 'campaign' }),
      };
    }
  }

  // Rule 2 & 3: keyword pause / bid change
  if (row.targetType === 'keyword') {
    const zeroConversionSpend = row.conversions === 0 && row.spend >= 5000;
    const poorRoas = roas > 0 && roas < 100;

    if (!isPaused(statusText) && (zeroConversionSpend || poorRoas)) {
      return {
        adTargetDailyId: row.id,
        listingId: row.listingId,
        actionType: 'pause_keyword',
        targetType: 'keyword',
        externalId: row.externalId,
        targetLabel,
        reason: zeroConversionSpend
          ? `전환 0건인데 광고비 ${formatNumber(row.spend)}원이 누적되었습니다. 즉시 OFF 권장.`
          : `ROAS ${Math.round(roas)}%로 기준 미달입니다. 키워드 OFF 후 재검토가 필요합니다.`,
        priority: grade === 'A' ? 'high' : 'urgent',
        currentValue: null,
        proposedValue: null,
        payload: basePayload(row, { pageType: 'keyword' }),
      };
    }

    if (row.currentBid && row.currentBid > 0 && roas >= 100 && roas < 200) {
      const nextBid = roundBid(row.currentBid * 0.85);
      if (nextBid < row.currentBid) {
        return {
          adTargetDailyId: row.id,
          listingId: row.listingId,
          actionType: 'change_bid',
          targetType: 'keyword',
          externalId: row.externalId,
          targetLabel,
          reason: `ROAS ${Math.round(roas)}%로 입찰가 하향 구간입니다. 현재 ${formatNumber(row.currentBid)}원 → ${formatNumber(nextBid)}원.`,
          priority: profitRateNum !== null && profitRateNum < 0 ? 'high' : 'medium',
          currentValue: row.currentBid,
          proposedValue: nextBid,
          payload: basePayload(row, { pageType: 'keyword' }),
        };
      }
    }
  }

  // Rule 4 & 5: campaign budget increase / decrease
  if (
    row.targetType === 'campaign' &&
    row.dailyBudget != null &&
    row.dailyBudget > 0
  ) {
    if (grade === 'A' && roas >= 480) {
      const nextBudget = roundBudget(row.dailyBudget * 1.2);
      if (nextBudget > row.dailyBudget) {
        return {
          adTargetDailyId: row.id,
          listingId: row.listingId,
          actionType: 'change_daily_budget',
          targetType: 'campaign',
          externalId: row.externalId,
          targetLabel,
          reason: `A등급 / ROAS ${Math.round(roas)}%로 예산 확대 구간입니다. 현재 ${formatNumber(row.dailyBudget)}원 → ${formatNumber(nextBudget)}원.`,
          priority: 'high',
          currentValue: row.dailyBudget,
          proposedValue: nextBudget,
          payload: basePayload(row, { pageType: 'campaign' }),
        };
      }
    }

    if ((grade === 'C' || roas < 100) && row.dailyBudget > 3000) {
      const nextBudget = Math.max(3000, roundBudget(row.dailyBudget * 0.5));
      if (nextBudget < row.dailyBudget) {
        return {
          adTargetDailyId: row.id,
          listingId: row.listingId,
          actionType: 'change_daily_budget',
          targetType: 'campaign',
          externalId: row.externalId,
          targetLabel,
          reason: `${grade}등급 / ROAS ${Math.round(roas)}%로 예산 축소 구간입니다. 현재 ${formatNumber(row.dailyBudget)}원 → ${formatNumber(nextBudget)}원.`,
          priority: grade === 'C' ? 'high' : 'medium',
          currentValue: row.dailyBudget,
          proposedValue: nextBudget,
          payload: basePayload(row, { pageType: 'campaign' }),
        };
      }
    }
  }

  return null;
}

export function calcProfitRate(option: {
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: number | null;
}): number | null {
  const cost = option.costPrice ?? 0;
  const sell = option.sellPrice ?? 0;
  if (sell <= 0) return null;
  const commission =
    option.commissionRate != null ? Number(option.commissionRate) : 0;
  const commissionFee = sell * commission;
  const profit = sell - cost - commissionFee;
  return Math.round((profit / sell) * 10000) / 100;
}

function basePayload(
  row: Pick<
    LatestTargetRow,
    'targetType' | 'campaignName' | 'keyword' | 'productName' | 'externalId' | 'status'
  >,
  extras: Record<string, unknown>,
) {
  return {
    pageType: row.targetType,
    campaignName: row.campaignName,
    keyword: row.keyword,
    productName: row.productName,
    externalId: row.externalId,
    status: row.status,
    ...extras,
  };
}

function roundBudget(value: number) {
  return Math.max(3000, Math.round(value / 100) * 100);
}

function roundBid(value: number) {
  return Math.max(100, Math.round(value / 10) * 10);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value));
}

function isPaused(statusText: string) {
  return ['off', '중지', '일시중지', '비활성', 'pause'].some((token) => statusText.includes(token));
}
