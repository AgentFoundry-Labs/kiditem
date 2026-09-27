import { recomputeRoas } from './util/ratio-recompute';
import { adConversions, performanceAdSpend } from './ad-spend-rule';
import type { AdActionTargetType } from './model/strategy-types';
import type { AdRuleTarget } from '../application/port/out/repository/ad-action.repository.port';

/**
 * Pure rule selector for `AdAction` candidates over the ad report ledger
 * (KID-372). A target is one campaign — its current `ChannelAdCampaign` state
 * (active, budget) and the product sums of the recent measured window — or one
 * search keyword with its window sums. The ledger has no bid, so there is no
 * bid rule. `budget` is the ad center's number as reported; the rules assume
 * KRW per day (unit not yet confirmed, KID-371). Performance is the delivered
 * spend and the report's orders.
 *
 * `AdActionService` reads the targets and the ChannelSku capacity of the
 * advertised options and feeds them here.
 */

export type ActionCandidate = {
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

/** Canonical component-derived capacity of one advertised option; `null` when unknown. */
export type ChannelSkuAdEvidence = {
  sellableStock: number | null;
};

/**
 * Derive at most one candidate from a rule target.
 *
 * `channelSkuEvidenceMap` is keyed by advertised option (`vendorItemId`).
 */
export function createActionCandidate(
  target: AdRuleTarget,
  channelSkuEvidenceMap: Map<string, ChannelSkuAdEvidence>,
): ActionCandidate | null {
  if (target.isActive === false) return null;
  const grade = target.abcGrade;
  const spend = performanceAdSpend(target.spend);
  // Recompute from the target's own sums; provider ratios are not trusted.
  const roas = recomputeRoas(target.revenue, spend) ?? 0;
  const targetLabel =
    target.keyword ||
    target.campaignName ||
    target.productName ||
    target.campaignId;

  if (target.targetType === 'keyword') {
    // The non-search row is not a keyword the operator can pause.
    if (!target.keyword) return null;
    const zeroConversionSpend = adConversions(target) === 0 && spend >= 5000;
    const poorRoas = roas > 0 && roas < 100;
    if (!zeroConversionSpend && !poorRoas) return null;
    return {
      listingId: target.listingId,
      actionType: 'pause_keyword',
      targetType: 'keyword',
      externalId: target.vendorItemId,
      targetLabel,
      reason: zeroConversionSpend
        ? `전환 0건인데 광고비 ${formatNumber(spend)}원이 누적되었습니다. 즉시 OFF 권장.`
        : `ROAS ${Math.round(roas)}%로 기준 미달입니다. 키워드 OFF 후 재검토가 필요합니다.`,
      priority: grade === 'A' ? 'high' : 'urgent',
      currentValue: null,
      proposedValue: null,
      payload: basePayload(target, targetLabel),
    };
  }

  const budget = target.budget;
  if (budget == null || budget <= 0) return null;
  const campaignCandidate = (
    priority: ActionCandidate['priority'],
    proposedValue: number,
    reason: string,
  ): ActionCandidate => ({
    listingId: target.listingId,
    actionType: 'change_daily_budget',
    targetType: 'campaign',
    externalId: target.campaignId,
    targetLabel,
    reason,
    priority,
    currentValue: budget,
    proposedValue,
    payload: basePayload(target, targetLabel),
  });

  // Rule 1: every advertised option is sold out, yet the budget keeps running.
  // An option whose capacity is unknown never counts as sold out.
  if (
    target.vendorItemIds.length > 0 &&
    target.vendorItemIds.every((id) => channelSkuEvidenceMap.get(id)?.sellableStock === 0)
  ) {
    return campaignCandidate(
      'urgent',
      3000,
      `재고 0개인데 광고 예산 ${formatNumber(budget)}원이 유지 중입니다. 즉시 축소가 필요합니다.`,
    );
  }

  // A campaign that spent nothing in the window has no performance to judge
  // its budget on (a ROAS of 0 there is no evidence of a poor campaign).
  if (spend === 0) return null;

  // Rule 3: A-grade campaign with strong ROAS → budget expansion.
  if (grade === 'A' && roas >= 480) {
    const nextBudget = roundBudget(budget * 1.2);
    if (nextBudget > budget) {
      return campaignCandidate(
        'high',
        nextBudget,
        `A등급 / ROAS ${Math.round(roas)}%로 예산 확대 구간입니다. 현재 ${formatNumber(budget)}원 → ${formatNumber(nextBudget)}원.`,
      );
    }
  }

  // Rule 4: C grade or low ROAS → budget shrink.
  if ((grade === 'C' || roas < 100) && budget > 3000) {
    const nextBudget = Math.max(3000, roundBudget(budget * 0.5));
    if (nextBudget < budget) {
      return campaignCandidate(
        grade === 'C' ? 'high' : 'medium',
        nextBudget,
        `${grade ? `${grade}등급 / ` : ''}ROAS ${Math.round(roas)}%로 예산 축소 구간입니다. 현재 ${formatNumber(budget)}원 → ${formatNumber(nextBudget)}원.`,
      );
    }
  }

  return null;
}

/**
 * The proposal's display fields plus the ad report evidence it was judged on
 * (`adTarget`): the campaign, ad group, advertised option and keyword, and the
 * last measured day of the window.
 */
function basePayload(target: AdRuleTarget, targetLabel: string): Record<string, unknown> {
  return {
    pageType: target.targetType,
    campaignName: target.campaignName,
    keyword: target.keyword,
    productName: target.productName,
    targetLabel,
    adTarget: {
      campaignId: target.campaignId,
      adGroupId: target.adGroupId,
      vendorItemId: target.vendorItemId,
      ...(target.keyword ? { keyword: target.keyword } : {}),
      businessDate: target.businessDate,
      source: 'ad_report',
    },
  };
}

function roundBudget(value: number) {
  return Math.max(3000, Math.round(value / 100) * 100);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value));
}
