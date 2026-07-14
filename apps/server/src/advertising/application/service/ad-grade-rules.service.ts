import { Injectable } from '@nestjs/common';
import type { AdStrategyAction, AdIssues, ChannelStateSignal } from '@kiditem/shared/advertising';
import type { GradeRulesInput, AdIssuesInput, HydratedListing } from '../../domain/model/strategy-types';
import { hydratedListingToSummary } from '../../mapper/ad-listing.mapper';

type Priority = 'urgent' | 'high' | 'medium' | 'low';

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Pure calculator — Ad strategy 의 rule 평가 (listing-level ABC grade rules).
 *
 * Prisma 의존 없음. orchestrator 가 사전 fetch 한 adGroups + listings + gradeMap + profitRate 를
 * 받아 AdStrategyAction[] (recommendations) + AdIssues 카테고리화 결과 반환.
 *
 * 기존 ad-strategy.service.ts (B2b, 2c17850) line 653-1026 본문 이전.
 * 변경:
 *  - prisma 호출 제거 (input 으로 이동; adGroups = `legacy ad groupBy(['listingId'])` 결과)
 *  - productId → listingId (B2b 도입분)
 *  - hydratedListingToSummary 는 mapper/ad-listing.mapper import
 *
 * Threshold 보존: 5000 / 100 / 200 / 300 / 480 / 10000 / 50 / 20 / 0.35 / 3000 (B2b 원본).
 */
@Injectable()
export class AdGradeRulesService {
  /**
   * listing-level rule 평가 → recommendations.
   *
   * 기존 ad-strategy.service.ts:653-938 의 calcActions 본문 이전.
   * adGroups[].listingId 가 없거나 listing hydrate 에 missing 이면 skip.
   * spend === 0 인 listing 도 skip (B2b 원본 line 719).
   */
  calcActions(input: GradeRulesInput): AdStrategyAction[] {
    const {
      adGroups,
      listings,
      gradeMap,
      profitRateByListing,
      channelStateByListing,
    } = input;
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    const adMap = new Map(adGroups.map((a) => [a.listingId, a]));

    const actions: AdStrategyAction[] = [];

    for (const listing of listings) {
      const ad = adMap.get(listing.id);
      const spend = ad?.spend ?? 0;
      const revenue = ad?.revenue ?? 0;
      const clicks = ad?.clicks ?? 0;
      const impressions = ad?.impressions ?? 0;
      const conversions = ad?.conversions ?? 0;
      const roas = spend > 0 ? Math.round((revenue / spend) * 100) : 0;
      const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
      if (spend === 0) continue;

      const grade = gradeMap.get(listing.id) ?? normalizeGrade(listing.masterProduct.abcGrade);
      const primary = listing.primaryOption;
      const margin = calcOptionMargin(primary);
      const adBudgetLimit = margin > 0 ? margin * 0.35 : 0;
      const sellableStock = primary?.sellableStock ?? null;
      const profitRate = profitRateByListing.get(listing.id) ?? 0;
      const summary = hydratedListingToSummary(listing);
      const name = listing.masterProduct.name;

      const recs: Array<{ rule: string; reason: string; priority: Priority }> = [];

      // ═══ 공통 긴급 규칙 ═══
      if (sellableStock === 0 && listing.masterProduct.adTier && spend > 0) {
        recs.push({
          rule: '긴급: 재고0 광고ON',
          reason: '재고 없음 — 광고 즉시 중단. 재입고 확인 후 재개',
          priority: 'urgent',
        });
      }

      if (clicks >= 50 && conversions === 0 && spend > 0) {
        recs.push({
          rule: 'C-5 전환0 조기손절',
          reason: `클릭 ${clicks}회, 전환 0 — 키워드 OFF 또는 캠페인 중단 (광고비 ${Math.round(spend).toLocaleString()}원 낭비)`,
          priority: 'urgent',
        });
      }

      if (ctr >= 0.5 && roas < 100 && spend > 1000 && clicks >= 20) {
        recs.push({
          rule: 'B-7 CTR높음 전환낮음',
          reason: `CTR ${ctr}% (양호) but ROAS ${roas}% (저조) — 썸네일 OK, 상세페이지·가격·리뷰 재검토`,
          priority: 'high',
        });
      }

      if (adBudgetLimit > 0 && spend > adBudgetLimit * 14 && roas < 300) {
        recs.push({
          rule: '순이익 한도 초과',
          reason: `광고비 ${Math.round(spend).toLocaleString()}원 > 순이익 한도 ${Math.round(adBudgetLimit * 14).toLocaleString()}원 — 예산 축소 또는 ROAS 목표 상향`,
          priority: 'high',
        });
      }

      // ═══ 등급별 규칙 ═══
      if (grade === 'A') {
        if (roas >= 480 && spend > 0) {
          recs.push({
            rule: 'A-1 매출 확대',
            reason: `ROAS ${roas}% — 일예산 20% 증액 추천. 입찰가 10% 인상 검토`,
            priority: 'high',
          });
        } else if (roas >= 300 && ctr >= 0.3) {
          recs.push({
            rule: 'A-2 키워드 확장',
            reason: `ROAS ${roas}% + CTR ${ctr}% — ${listing.masterProduct.adTier ?? '없음'}→1차 승격. 매출최적화 키워드를 수동 캠페인에 추가`,
            priority: 'high',
          });
        } else if (roas < 200 && spend > 3000) {
          recs.push({
            rule: 'A-3 위험 감지',
            reason: `A등급 ROAS ${roas}%로 하락 — 입찰가 15% 하향 + 전환 0 키워드 제외 + 아이템위너 상태 확인`,
            priority: 'urgent',
          });
        }
      } else if (grade === 'B') {
        if (roas >= 480) {
          recs.push({
            rule: 'B-5 A승격',
            reason: `ROAS ${roas}% — A등급 캠페인으로 이동. 예산 비중 확대 (60~70% 목표)`,
            priority: 'high',
          });
        } else if (roas >= 300) {
          recs.push({
            rule: 'B-3 예산 유지',
            reason: `ROAS ${roas}% 안정 — 현재 예산 유지, 주간 모니터링. 제외 키워드 정리 추천`,
            priority: 'low',
          });
        } else if (roas >= 100 && ctr < 0.15) {
          recs.push({
            rule: 'B-2 소재 테스트',
            reason: `CTR ${ctr}% 미달 — 썸네일 교체 추천. 경쟁사 상위 3개 썸네일 벤치마킹 후 A/B 테스트`,
            priority: 'medium',
          });
        } else if (roas >= 100 && roas < 200) {
          recs.push({
            rule: 'B-4 입찰가 하향',
            reason: `ROAS ${roas}% — 입찰가 15% 하향. 메인 키워드 경쟁 과열이면 롱테일 키워드(100~300원)로 전환`,
            priority: 'medium',
          });
        } else if (roas >= 200) {
          recs.push({
            rule: 'B-6 롱테일 키워드',
            reason: `ROAS ${roas}% 보통 — 핵심 키워드 20~30개에 집중 + 롱테일 키워드로 저비용 전환 확보`,
            priority: 'medium',
          });
        }
      } else if (grade === 'C' || spend > 0) {
        if (spend > 0 && revenue === 0) {
          recs.push({
            rule: 'C-1 광고 중단',
            reason: `광고비 ${Math.round(spend).toLocaleString()}원 지출, 전환 0원 — 즉시 OFF. 아이템위너 여부 확인 필수`,
            priority: 'urgent',
          });
        } else if (roas > 0 && roas < 50) {
          recs.push({
            rule: 'C-2 최소 예산',
            reason: `ROAS ${roas}% — 일예산 3,000원 축소. 2주 후에도 개선 없으면 OFF`,
            priority: 'high',
          });
        } else if (roas >= 50 && roas < 100) {
          recs.push({
            rule: 'C-2 최소 예산',
            reason: `ROAS ${roas}% — 일예산 3,000원 축소 + 롱테일 키워드만 유지`,
            priority: 'high',
          });
        }
      }

      if (recs.length === 0) continue;

      recs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
      const main = recs[0];

      const actionType = this.ruleToActionType(main.rule);
      const currentValue = roas;
      const proposedValue = profitRate > 0 ? Math.round(profitRate) : null;

      // Attach channel-state evidence (latest daily snapshot) when
      // available. Reason text is enriched only when the snapshot reveals a
      // meaningful adverse condition (offer-winner lost / option out of stock /
      // exposure suspended); otherwise the reason stays exactly as before so
      // callers without a snapshot see no diff.
      const channelState = channelStateByListing?.get(listing.id) ?? null;
      const reason = channelState
        ? appendChannelEvidence(main.reason, channelState)
        : main.reason;

      actions.push({
        listing: summary,
        grade,
        actionType,
        priority: main.priority,
        reason,
        currentValue,
        proposedValue,
        channelState,
      } satisfies AdStrategyAction);
      // name 은 reason/alert 생성 시 사용되며 현재 AdStrategyAction 에 노출되진 않음 (B2b alert 제거분).
      void name;
    }

    actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return actions;
  }

  /**
   * Ad issues 카테고리화 (zeroConversion / lowRoas / highSpend).
   *
   * 기존 ad-strategy.service.ts:955-1026 의 calcAdIssues 본문 이전.
   * adGroups 는 orchestrator 가 legacy ad groupBy(['listingId']) (최근 14d) 으로 사전 fetch.
   * Threshold 복원 (B2b 원본):
   *  - zeroConversion: spend > 0 && conversions === 0
   *  - lowRoas:        spend > 0 && revenue > 0 && roas < 100
   *  - highSpend:      spend >= 10000
   */
  calcAdIssues(input: AdIssuesInput): AdIssues {
    const { adGroups, listings, gradeMap } = input;
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    const zeroConversion: AdStrategyAction[] = [];
    const lowRoas: AdStrategyAction[] = [];
    const highSpend: AdStrategyAction[] = [];

    for (const g of adGroups) {
      const listing = listingMap.get(g.listingId);
      if (!listing) continue;
      const spend = g.spend;
      const adRevenue = g.revenue;
      const conversions = g.conversions;
      const roas = spend > 0 ? Math.round((adRevenue / spend) * 100) : 0;

      const grade = gradeMap.get(listing.id) ?? normalizeGrade(listing.masterProduct.abcGrade);
      const summary = hydratedListingToSummary(listing);

      if (spend > 0 && conversions === 0) {
        zeroConversion.push({
          listing: summary,
          grade,
          actionType: 'stop',
          priority: 'urgent',
          reason: `전환 0 — 광고 중단 검토 (광고비 ${Math.round(spend).toLocaleString()}원)`,
          currentValue: conversions,
          proposedValue: 0,
        } satisfies AdStrategyAction);
      }

      if (spend > 0 && adRevenue > 0 && roas < 100) {
        lowRoas.push({
          listing: summary,
          grade,
          actionType: 'decrease',
          priority: 'high',
          reason: `ROAS ${roas}% — 예산 축소 권장`,
          currentValue: roas,
          proposedValue: null,
        } satisfies AdStrategyAction);
      }

      if (spend >= 10000) {
        highSpend.push({
          listing: summary,
          grade,
          actionType: 'maintain',
          priority: 'medium',
          reason: `고비용 ${Math.round(spend).toLocaleString()}원 — 효율 점검`,
          currentValue: spend,
          proposedValue: null,
        } satisfies AdStrategyAction);
      }
    }

    return { zeroConversion, lowRoas, highSpend } satisfies AdIssues;
  }

  /**
   * rule key → AdAction.actionType 매핑.
   *
   * 기존 ad-strategy.service.ts:941-953 의 ruleToActionType 본문 복원.
   * 등급별 rule prefix (A-1 / A-3 / C-1 / C-2 / B-4) 또는 rule 본문 키워드 (재고0 / 순이익 / 전환0)
   * 에 따라 'increase' / 'stop' / 'decrease' / 'maintain' 중 하나로 환원.
   */
  ruleToActionType(rule: string): string {
    if (rule.startsWith('A-1') || rule.startsWith('A-5')) return 'increase';
    if (rule.startsWith('A-3') || rule.startsWith('C-1') || rule.includes('재고0'))
      return 'stop';
    if (
      rule.startsWith('C-2') ||
      rule.startsWith('B-4') ||
      rule.includes('순이익') ||
      rule.includes('전환0')
    )
      return 'decrease';
    return 'maintain';
  }
}

// ─────────────────────────────────────────────────────────────
// Module-private pure helpers (B2b 원본 helpers 복원)
// ─────────────────────────────────────────────────────────────

function normalizeGrade(raw: 'A' | 'B' | 'C' | null | undefined): 'A' | 'B' | 'C' | null {
  if (raw === 'A' || raw === 'B' || raw === 'C') return raw;
  return null;
}

/**
 * option 단위 margin = sellPrice - costPrice (costPrice/sellPrice 누락 시 0).
 * B2b 원본 ad-strategy.service.ts:90-98 본문 복원.
 */
function calcOptionMargin(option: HydratedListing['primaryOption']): number {
  if (!option) return 0;
  const cost = option.purchaseCost ?? 0;
  const sell = option.salePrice ?? 0;
  if (sell <= 0 || cost <= 0) return 0;
  return sell - cost;
}

/**
 * Append channel daily-snapshot evidence to the reason text.
 *
 * Rules (only adverse signals — positive states stay implicit):
 * - offer-winner lost → `· 아이템위너 아님` (+ winner price/gap when known)
 * - exposure/sale status not 'active' → `· 채널 상태 <status>`
 * - primary option stockQty === 0 → `· 옵션 재고 0`
 *
 * Always suffix the businessDate so reviewers know the evidence freshness.
 */
function appendChannelEvidence(reason: string, state: ChannelStateSignal): string {
  const fragments: string[] = [];

  if (state.isOfferWinner === false) {
    if (state.winnerPrice != null && state.winnerGapPrice != null) {
      fragments.push(
        `아이템위너 아님 (winner ${state.winnerPrice.toLocaleString()}원, 차이 ${state.winnerGapPrice.toLocaleString()}원)`,
      );
    } else {
      fragments.push('아이템위너 아님');
    }
  }

  const adverseStatus = (value: string | null): boolean =>
    value != null && value.length > 0 && value.toLowerCase() !== 'active';
  if (adverseStatus(state.exposureStatus)) {
    fragments.push(`노출 ${state.exposureStatus}`);
  }
  if (adverseStatus(state.saleStatus)) {
    fragments.push(`판매 ${state.saleStatus}`);
  }

  const optStock = state.primaryOption?.stockQty;
  if (optStock === 0) fragments.push('옵션 재고 0');

  if (fragments.length === 0) return reason;
  return `${reason} · ${fragments.join(' · ')} (${state.businessDate} 관측)`;
}
