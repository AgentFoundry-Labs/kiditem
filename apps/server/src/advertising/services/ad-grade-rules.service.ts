import { Injectable } from '@nestjs/common';
import type { AdStrategyAction, AdIssues } from '@kiditem/shared';
import type { Prisma } from '@prisma/client';
import type { GradeRulesInput, AdIssuesInput, InventoryRow } from './types';
import { toListingSummary } from './util/ad-strategy-helpers';

/**
 * Pure calculator — Ad strategy 의 rule 평가.
 *
 * Prisma 의존 없음. orchestrator 가 사전 fetch 한 snapshots/listings/inventory/gradeMap 을 받아
 * AdStrategyAction[] (recommendations) + AdIssues 카테고리화 결과 반환.
 *
 * 기존 ad-strategy.service.ts:653-1028 의 calcActions / calcAdIssues / ruleToActionType 본문 이전.
 * 변경:
 *  - prisma 호출 제거 (input 으로 이동)
 *  - productId → listingId
 *  - snapshot.product.inventory.currentStock → InventoryRow.availableStock (snapshot.optionId 로 lookup)
 *  - snapshot.product.profitLoss[0].profitRate → InventoryRow.{costPrice, sellPrice, commissionRate} 로 inline 계산
 *  - toListingSummary 는 util/ad-strategy-helpers import (DRY, plan v2 amendment)
 *
 * Threshold 보존: 5000 / 100 / 200 / 480 / 0.85 / 1.2 / 0.5 / 3000.
 */
@Injectable()
export class AdGradeRulesService {
  /**
   * snapshot 별 rule 평가 → recommendations.
   *
   * 기존 ad-strategy.service.ts:653-941 의 calcActions 본문 이전.
   * snapshot.listingId 미존재 / listingMap miss 인 경우 skip.
   */
  calcActions(input: GradeRulesInput): AdStrategyAction[] {
    const { snapshots, listings, inventory, gradeMap } = input;
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    const actions: AdStrategyAction[] = [];

    for (const snapshot of snapshots) {
      if (!snapshot.listingId) continue;
      const listing = listingMap.get(snapshot.listingId);
      if (!listing) continue;
      const grade = gradeMap.get(snapshot.listingId) ?? 'C';
      const inv = snapshot.optionId ? inventory.get(snapshot.optionId) ?? null : null;
      const action = this.evaluateRules(snapshot, listing, grade, inv);
      if (action) actions.push(action);
    }
    return actions;
  }

  /**
   * Ad issues 카테고리화 (zeroConversion / lowRoas / highSpend).
   *
   * 기존 ad-strategy.service.ts:955-1028 의 calcAdIssues 본문 이전.
   * 변경: prisma.ad.groupBy + hydrateListings 호출 제거 — adGroups + listings 는 orchestrator 가 사전 fetch 후 input.
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
      const grade = gradeMap.get(g.listingId) ?? 'C';
      const roas = g.spend > 0 ? (g.revenue / g.spend) * 100 : 0;
      const summary = toListingSummary(listing);

      if (g.conversions === 0 && g.spend >= 5000) {
        zeroConversion.push({
          listing: summary,
          grade,
          actionType: 'investigate',
          priority: 'urgent',
          reason: `전환 0건 누적 광고비 ${g.spend.toLocaleString()}원`,
          currentValue: null,
          proposedValue: null,
        } satisfies AdStrategyAction);
      }
      if (roas > 0 && roas < 100 && g.spend >= 5000) {
        lowRoas.push({
          listing: summary,
          grade,
          actionType: 'reduce_budget',
          priority: 'high',
          reason: `ROAS ${Math.round(roas)}% 기준 미달`,
          currentValue: null,
          proposedValue: null,
        } satisfies AdStrategyAction);
      }
      if (g.spend >= 50000 && roas < 200) {
        highSpend.push({
          listing: summary,
          grade,
          actionType: 'review_campaign',
          priority: 'medium',
          reason: `높은 광고비 ${g.spend.toLocaleString()}원 ROAS ${Math.round(roas)}%`,
          currentValue: null,
          proposedValue: null,
        } satisfies AdStrategyAction);
      }
    }
    return { zeroConversion, lowRoas, highSpend } satisfies AdIssues;
  }

  /**
   * rule key → AdAction.actionType 매핑.
   *
   * 기존 ad-strategy.service.ts:941-955 의 ruleToActionType 본문 이전.
   * snapshot-level 5 rule 의 rule key (change_daily_budget / pause_keyword / change_bid)
   * 는 이미 actionType 그대로이므로 identity 매핑이지만, 향후 rule key → action type
   * 비대칭 매핑이 생기면 이 함수가 단일 dispatch 지점이 된다.
   */
  ruleToActionType(rule: string): string {
    return rule;
  }

  // ───── private helpers ─────

  /**
   * snapshot-level 5 rule 분기. 단일 snapshot 입력 → 0 또는 1 action 반환.
   * 우선순위: Rule 1 (stock=0) → Rule 2/3 (keyword) → Rule 4/5 (campaign budget).
   * 첫 번째로 trigger 된 rule 만 action 으로 환원 (여러 rule 동시 trigger 시 상단 우선).
   */
  private evaluateRules(
    snapshot: GradeRulesInput['snapshots'][number],
    listing: GradeRulesInput['listings'][number],
    grade: 'A' | 'B' | 'C',
    inv: InventoryRow | null,
  ): AdStrategyAction | null {
    const stock = inv?.availableStock ?? null;
    const roas = snapshot.roas !== null && snapshot.roas !== undefined ? Number(snapshot.roas) : 0;
    const profitRateNum = this.computeProfitRate(inv);
    const statusText = (snapshot.status ?? '').toLowerCase();

    // Rule 1: stock=0 + campaign + dailyBudget>0 → 즉시 축소 (option 없으면 skip — listing-level snapshot 은 option stock 판정 불가)
    if (
      stock === 0 &&
      snapshot.pageType === 'campaign' &&
      snapshot.dailyBudget !== null &&
      snapshot.dailyBudget !== undefined &&
      snapshot.dailyBudget > 0
    ) {
      return {
        listing: toListingSummary(listing),
        grade,
        actionType: this.ruleToActionType('change_daily_budget'),
        priority: 'urgent',
        reason: `재고 0 + 일예산 ${snapshot.dailyBudget.toLocaleString()}원 → 즉시 축소`,
        currentValue: snapshot.dailyBudget,
        proposedValue: 3000,
      } satisfies AdStrategyAction;
    }

    // Rule 2 / 3: keyword pause / bid 하향
    if (snapshot.pageType === 'keyword') {
      const isPaused = statusText.includes('일시중지') || statusText.includes('off');
      const zeroConvSpend = snapshot.conversions === 0 && snapshot.spend >= 5000;
      const poorRoas = roas > 0 && roas < 100;

      // Rule 2: zero-conv (spend≥5000) ∨ roas∈(0,100) → pause_keyword
      //         A 등급은 high (덜 공격적), 그 외는 urgent
      if (!isPaused && (zeroConvSpend || poorRoas)) {
        return {
          listing: toListingSummary(listing),
          grade,
          actionType: 'pause_keyword',
          priority: grade === 'A' ? 'high' : 'urgent',
          reason: zeroConvSpend
            ? `전환 0 + 광고비 ${snapshot.spend.toLocaleString()}원 → OFF`
            : `ROAS ${Math.round(roas)}% 기준 미달 → OFF`,
          currentValue: null,
          proposedValue: null,
        } satisfies AdStrategyAction;
      }

      // Rule 3: roas∈[100,200) + currentBid>0 → change_bid (nextBid = round(current*0.85))
      //         profitRate<0 시 high, 그 외 medium
      if (
        snapshot.currentBid !== null &&
        snapshot.currentBid !== undefined &&
        snapshot.currentBid > 0 &&
        roas >= 100 &&
        roas < 200
      ) {
        const nextBid = this.roundBid(snapshot.currentBid * 0.85);
        if (nextBid < snapshot.currentBid) {
          return {
            listing: toListingSummary(listing),
            grade,
            actionType: 'change_bid',
            priority: profitRateNum !== null && profitRateNum < 0 ? 'high' : 'medium',
            reason: `ROAS ${Math.round(roas)}% → 입찰가 하향`,
            currentValue: snapshot.currentBid,
            proposedValue: nextBid,
          } satisfies AdStrategyAction;
        }
      }
    }

    // Rule 4 / 5: campaign budget 확대 / 축소
    if (
      snapshot.pageType === 'campaign' &&
      snapshot.dailyBudget !== null &&
      snapshot.dailyBudget !== undefined &&
      snapshot.dailyBudget > 0
    ) {
      // Rule 4: grade=A + roas>=480 → change_daily_budget (1.2x, high)
      if (grade === 'A' && roas >= 480) {
        const nextBudget = this.roundBudget(snapshot.dailyBudget * 1.2);
        if (nextBudget > snapshot.dailyBudget) {
          return {
            listing: toListingSummary(listing),
            grade,
            actionType: 'change_daily_budget',
            priority: 'high',
            reason: `A등급 ROAS ${Math.round(roas)}% → 예산 확대`,
            currentValue: snapshot.dailyBudget,
            proposedValue: nextBudget,
          } satisfies AdStrategyAction;
        }
      }
      // Rule 5: (grade=C ∨ roas<100) + dailyBudget>3000 → change_daily_budget (max(3000, 0.5x))
      //         C 등급은 high, 그 외는 medium
      if ((grade === 'C' || roas < 100) && snapshot.dailyBudget > 3000) {
        const nextBudget = Math.max(3000, this.roundBudget(snapshot.dailyBudget * 0.5));
        if (nextBudget < snapshot.dailyBudget) {
          return {
            listing: toListingSummary(listing),
            grade,
            actionType: 'change_daily_budget',
            priority: grade === 'C' ? 'high' : 'medium',
            reason: `${grade}등급 ROAS ${Math.round(roas)}% → 예산 축소`,
            currentValue: snapshot.dailyBudget,
            proposedValue: nextBudget,
          } satisfies AdStrategyAction;
        }
      }
    }
    return null;
  }

  /**
   * (sellPrice - costPrice - commission) / sellPrice. 0~1 범위 (예: 0.25 = 25%).
   * costPrice 또는 sellPrice 가 null/0 이면 null (계산 불가).
   * commissionRate 는 Prisma.Decimal — Number coerce.
   */
  private computeProfitRate(inv: InventoryRow | null): number | null {
    if (!inv?.costPrice || !inv?.sellPrice) return null;
    const comm = inv.commissionRate ? this.decimalToNumber(inv.commissionRate) : 0;
    return (inv.sellPrice * (1 - comm) - inv.costPrice) / inv.sellPrice;
  }

  /** Prisma.Decimal | number → number coerce (테스트에서 plain number 도 받기 위함). */
  private decimalToNumber(value: Prisma.Decimal | number): number {
    return typeof value === 'number' ? value : Number(value);
  }

  /** 입찰가 10원 단위 round (쿠팡 입찰 최소 단위). */
  private roundBid(value: number): number {
    return Math.round(value / 10) * 10;
  }

  /** 일예산 1000원 단위 round (쿠팡 예산 최소 단위). */
  private roundBudget(value: number): number {
    return Math.round(value / 1000) * 1000;
  }
}
