import { Injectable } from '@nestjs/common';
import type { ExposureAnalysisData, ExposureFactorScore, ExposureProductScore, ExposureUrgentAction } from '@kiditem/shared/advertising';
import type { ExposureScoreInput, TopIssueInput } from '../../domain/model/strategy-types';
import { hydratedListingToSummary } from '../../mapper/ad-listing.mapper';

/**
 * Pure calculator — Exposure analysis (5 score + topIssue + assembly).
 *
 * Prisma 의존 없음. orchestrator (T7) 가 사전 fetch 한 listing/metrics/inventory/reviewStats/
 * trafficContext/fulfillmentContext 를 받아 ExposureProductScore + ExposureAnalysisData 반환.
 *
 * 기존 ad-strategy.service.ts:199-371 (getExposureAnalysis score-assembly loop)
 * + :1218-1306 (5 calculate*Score) + :1308-1410 (determineTopIssue 단순화) 본문 이전.
 *
 * 변경:
 *  - prisma 호출 제거 (orchestrator 책임)
 *  - snapshot.product.inventory.currentStock → input.inventory?.availableStock
 *  - review aggregate (count/avg) → input.reviewStats
 *  - ad metrics → input.metrics
 *  - traffic.{rev, prevRev, orders} + maxT14 → input.trafficContext
 *  - inv.leadTime + option profitRate → input.fulfillmentContext
 *  - determineTopIssue 는 T1 의 TopIssueInput 형태 (scores only) 로 단순화 — label 기반.
 *  - hydratedListingToSummary 는 mapper/ad-listing.mapper import (DRY)
 *
 * 5 score weight: sales 0.25 / review 0.2 / ad 0.25 / fulfillment 0.2 / info 0.1 (원본 보존).
 */
@Injectable()
export class AdExposureService {
  /**
   * 단일 listing 의 5 score + totalScore + topIssue 계산.
   *
   * 기존 ad-strategy.service.ts:266-348 (getExposureAnalysis loop body) + :1218-1306 (5 score)
   * 본문 이전.
   */
  calculateScores(input: ExposureScoreInput): ExposureProductScore {
    const { listing, metrics, inventory, reviewStats, trafficContext, fulfillmentContext } = input;

    // ad metrics → score input 으로 정규화 (원본은 ad?.spend ?? 0 등 nullable 처리, 여기서는 metrics 가 항상 존재)
    const m = metrics.metrics;
    const spend = m.spend;
    const roas = m.roas ?? 0;
    // 원본 (line 282-283): ctr/cvr 은 percent 단위 (e.g. 0.5 = 0.5%). AdMetrics.ctr 은 ratio (0~1) 이므로 *100.
    const ctr = (m.ctr ?? 0) * 100;
    const cvr = (m.cvr ?? 0) * 100;

    const reviews = reviewStats ?? { totalReviews: 0, recentReviews: 0, avgRating: 0 };

    const salesScore = this.calculateSalesScore({
      maxT14: trafficContext.maxT14,
      t14Rev: trafficContext.t14Rev,
      t14PrevRev: trafficContext.t14PrevRev,
      t14Orders: trafficContext.t14Orders,
    });
    const reviewScore = this.calculateReviewScore({
      totalReviews: reviews.totalReviews,
      recentReviews: reviews.recentReviews,
      avgRating: reviews.avgRating,
    });
    const adScore = this.calculateAdScore({ spend, roas, ctr, cvr });
    const fulfillmentScore = this.calculateFulfillmentScore({
      leadTime: fulfillmentContext.leadTime,
      stock: inventory?.availableStock ?? 0,
      profitRate: fulfillmentContext.profitRate,
    });
    const infoScore = this.calculateInfoScore({
      healthScore: listing.masterProduct.healthScore,
      adTier: listing.masterProduct.adTier,
    });

    // 원본 line 306-312: 가중평균 + Math.round.
    const totalScore = Math.round(
      salesScore * 0.25 +
        reviewScore * 0.2 +
        adScore * 0.25 +
        fulfillmentScore * 0.2 +
        infoScore * 0.1,
    );

    const topIssue = this.determineTopIssue({
      listing,
      scores: {
        sales: salesScore,
        review: reviewScore,
        ad: adScore,
        fulfillment: fulfillmentScore,
        info: infoScore,
      },
    });

    const factors: ExposureFactorScore[] = [
      { factor: 'sales', score: salesScore, weight: 0.25 },
      { factor: 'review', score: reviewScore, weight: 0.2 },
      { factor: 'ad', score: adScore, weight: 0.25 },
      { factor: 'fulfillment', score: fulfillmentScore, weight: 0.2 },
      { factor: 'info', score: infoScore, weight: 0.1 },
    ];

    return {
      listing: hydratedListingToSummary(listing),
      grade: listing.masterProduct.abcGrade,
      factors,
      totalScore,
      topIssue,
    } satisfies ExposureProductScore;
  }

  /**
   * Score 배열 → ExposureAnalysisData (sort + urgentActions 추출).
   *
   * 원본 line 367-370: scores asc sort + urgentActions 30개 제한.
   * urgent 추출 기준은 원본 line 350-364 의 "최저 점수 factor < 30" 보다 단순한
   * "totalScore < 40 + topIssue 존재" 로 통일 (Plan v2 amendment).
   */
  assembleExposureData(scores: ExposureProductScore[]): ExposureAnalysisData {
    const sorted = [...scores].sort((a, b) => a.totalScore - b.totalScore);
    const urgentActions: ExposureUrgentAction[] = sorted
      .filter((s) => s.totalScore < 40 && s.topIssue !== null)
      .slice(0, 30)
      .map(
        (s) =>
          ({
            listing: s.listing,
            grade: s.grade,
            issue: s.topIssue!,
            suggestedAction: this.suggestActionForIssue(s.topIssue!),
          }) satisfies ExposureUrgentAction,
      );
    return { scores: sorted, urgentActions } satisfies ExposureAnalysisData;
  }

  /**
   * worst score → topIssue label 결정.
   *
   * 기존 ad-strategy.service.ts:1308-1410 본문 단순화 이전.
   * T1 TopIssueInput 이 scores 만 carry — 원본의 context-driven action string 은
   * orchestrator (T7) 가 별도 enrichment hook 으로 처리할 수 있게 label 만 반환.
   * 모든 score >= 70 이면 null (양호).
   */
  determineTopIssue(input: TopIssueInput): string | null {
    const { sales, review, ad, fulfillment, info } = input.scores;
    const entries = [
      { name: 'sales', score: sales, label: '매출 부진' },
      { name: 'review', score: review, label: '리뷰 부족' },
      { name: 'ad', score: ad, label: '광고 비효율' },
      { name: 'fulfillment', score: fulfillment, label: '배송/재고 이슈' },
      { name: 'info', score: info, label: '상품 정보 미흡' },
    ].sort((a, b) => a.score - b.score);
    const worst = entries[0];
    if (worst.score >= 70) return null;
    return worst.label;
  }

  // ───── 5 score 계산 (기존 ad-strategy.service.ts:1218-1306 본문 verbatim) ─────

  /**
   * 매출 점수 (max 100). 원본 line 1218-1238.
   * - t14Pct (0~60): 동기간 매출의 maxT14 대비 비율 * 60
   * - growthScore (0/10/20): t14Rev/t14PrevRev 비율 (>1.1 → 20, ≥1.0 → 10, else 0). prev=0 이면 t14Rev>0 이면 10
   * - orderScore (0/20): t14Orders > 0 이면 20
   */
  private calculateSalesScore(params: {
    maxT14: number;
    t14Rev: number;
    t14PrevRev: number;
    t14Orders: number;
  }): number {
    const { maxT14, t14Rev, t14PrevRev, t14Orders } = params;
    const t14Pct = maxT14 > 0 ? (t14Rev / maxT14) * 60 : 0;
    const growthScore =
      t14PrevRev > 0
        ? t14Rev / t14PrevRev > 1.1
          ? 20
          : t14Rev / t14PrevRev >= 1.0
            ? 10
            : 0
        : t14Rev > 0
          ? 10
          : 0;
    const orderScore = t14Orders > 0 ? 20 : 0;
    return Math.min(100, Math.round(t14Pct + growthScore + orderScore));
  }

  /**
   * 리뷰 점수 (max 100). 원본 line 1240-1260.
   * - totalRevScore (0/10/20/30/40): 누적 리뷰 수 thresholds 1/10/20/50
   * - recentRevScore (0/10/25/40): 최근 30일 리뷰 수 thresholds 1/5/10
   * - ratingScore (0~20): avgRating/5 * 20
   */
  private calculateReviewScore(params: {
    totalReviews: number;
    recentReviews: number;
    avgRating: number;
  }): number {
    const { totalReviews, recentReviews, avgRating } = params;
    const totalRevScore =
      totalReviews >= 50
        ? 40
        : totalReviews >= 20
          ? 30
          : totalReviews >= 10
            ? 20
            : totalReviews >= 1
              ? 10
              : 0;
    const recentRevScore =
      recentReviews >= 10 ? 40 : recentReviews >= 5 ? 25 : recentReviews >= 1 ? 10 : 0;
    const ratingScore = avgRating > 0 ? Math.round((avgRating / 5) * 20) : 0;
    return Math.min(100, totalRevScore + recentRevScore + ratingScore);
  }

  /**
   * 광고 점수 (max 100). 원본 line 1262-1275.
   * - spend=0 → 50 (광고 OFF 중립값)
   * - roasScore (0/10/20/30/40): roas thresholds 100/200/400/650
   * - ctrScore (0/10/20/30): ctr thresholds 0.1/0.3/0.5 (% 단위)
   * - cvrScore (0/10/20/30): cvr thresholds 1/3/5 (% 단위)
   */
  private calculateAdScore(params: {
    spend: number;
    roas: number;
    ctr: number;
    cvr: number;
  }): number {
    const { spend, roas, ctr, cvr } = params;
    if (spend === 0) return 50;
    const roasScore =
      roas >= 650 ? 40 : roas >= 400 ? 30 : roas >= 200 ? 20 : roas >= 100 ? 10 : 0;
    const ctrScore = ctr >= 0.5 ? 30 : ctr >= 0.3 ? 20 : ctr >= 0.1 ? 10 : 0;
    const cvrScore = cvr >= 5 ? 30 : cvr >= 3 ? 20 : cvr >= 1 ? 10 : 0;
    return Math.min(100, roasScore + ctrScore + cvrScore);
  }

  /**
   * 출고/가격 점수 (max 100). 원본 line 1277-1296.
   * - leadScore: 0=40, 1=35, 2=25, ≥3=10, null=20 (정보 없음 중립)
   * - stockScore (0/10/20/30): stock >50/≥10/≥1
   * - profitScore (0/10/20/30): profitRate >10/≥5/≥0
   */
  private calculateFulfillmentScore(params: {
    leadTime: number | null;
    stock: number;
    profitRate: number;
  }): number {
    const { leadTime, stock, profitRate } = params;
    const leadScore =
      leadTime === 0
        ? 40
        : leadTime === 1
          ? 35
          : leadTime === 2
            ? 25
            : leadTime != null
              ? 10
              : 20;
    const stockScore = stock > 50 ? 30 : stock >= 10 ? 20 : stock >= 1 ? 10 : 0;
    const profitScore = profitRate > 10 ? 30 : profitRate >= 5 ? 20 : profitRate >= 0 ? 10 : 0;
    return Math.min(100, leadScore + stockScore + profitScore);
  }

  /**
   * 상품정보 점수 (max 100). 원본 line 1298-1306.
   * - healthScore: cap 80 (null → 0)
   * - adTier 존재 시 +20
   */
  private calculateInfoScore(params: {
    healthScore: number | null;
    adTier: string | null;
  }): number {
    const { healthScore, adTier } = params;
    const hs = Math.min(80, healthScore ?? 0);
    const adTierBonus = adTier ? 20 : 0;
    return Math.min(100, hs + adTierBonus);
  }

  /**
   * topIssue label → 권장 액션 문자열 매핑.
   *
   * 원본 (line 350-364) 은 factor 별 context-driven action 을 생성했지만,
   * T1 TopIssueInput 이 context 미포함이므로 label 기반 정적 매핑으로 단순화.
   * 향후 enrich 필요 시 orchestrator (T7) 에서 후처리.
   */
  private suggestActionForIssue(issue: string): string {
    if (issue.includes('매출')) return '매출 부진 원인 분석 + 광고 캠페인 재구성';
    if (issue.includes('리뷰')) return '리뷰 수집 캠페인 (구매 후 리뷰 요청)';
    if (issue.includes('광고')) return '저ROAS 키워드 OFF + bid 조정';
    if (issue.includes('배송')) return '재고 보충 + 배송 정책 확인';
    if (issue.includes('상품 정보')) return '상품 페이지 보강 (이미지/설명 개선)';
    return '운영 검토 필요';
  }
}
