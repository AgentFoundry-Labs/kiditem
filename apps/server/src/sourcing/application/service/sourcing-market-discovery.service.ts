import { Injectable } from '@nestjs/common';
import { scoreSourcingOpportunity } from '../../domain/opportunity-score';

export interface SourcingMarketDiscoveryInput {
  organizationId: string;
  keyword: string;
  category?: string | null;
  mode?: 'stub' | 'replay';
}

export interface SourcingRecommendationCandidate {
  id: string;
  productName: string;
  coupangEvidence: Record<string, unknown>;
  supplierEvidence: Record<string, unknown>;
  score: ReturnType<typeof scoreSourcingOpportunity>;
  artifact: {
    title: string;
    summary: Record<string, unknown>;
  };
}

export interface SourcingMarketDiscoveryResult {
  marketSignals: Array<Record<string, unknown>>;
  coupangMatches: Array<Record<string, unknown>>;
  trackingSnapshots: Array<Record<string, unknown>>;
  supplierMatches: Array<Record<string, unknown>>;
  scoredOpportunities: Array<Record<string, unknown>>;
  recommendations: SourcingRecommendationCandidate[];
}

@Injectable()
export class SourcingMarketDiscoveryService {
  async discover(
    input: SourcingMarketDiscoveryInput,
  ): Promise<SourcingMarketDiscoveryResult> {
    void input.organizationId;
    const keyword = input.keyword.trim() || '실리콘 식판';
    const productName = `${keyword} 흡착형 신제품`;
    const score = scoreSourcingOpportunity({
      reviewGrowth7d: 42,
      rankDelta7d: -18,
      sellerCount: 4,
      priceKrw: 15900,
      estimatedLandedCostKrw: 5900,
      supplierConfidence: 0.86,
      riskFlags: [],
    });

    const marketSignals = [
      {
        keyword,
        category: input.category ?? null,
        rank: 12,
        rankDelta7d: -18,
        capturedMode: input.mode ?? 'stub',
      },
    ];
    const coupangMatches = [
      {
        productName,
        priceKrw: 15900,
        reviewGrowth7d: 42,
        sellerCount: 4,
        latestRegistrationDays: 11,
      },
    ];
    const trackingSnapshots = [
      {
        productName,
        reviewGrowth7d: 42,
        rankDelta7d: -18,
        sellerCount: 4,
        capturedMode: input.mode ?? 'stub',
      },
    ];
    const supplierMatches = [
      {
        supplierName: '1688 Kids Tableware Factory',
        productName,
        unitPriceCny: 22.8,
        moq: 2,
        confidence: 0.86,
      },
    ];
    const scoredOpportunities = [
      {
        productName,
        score: score.totalScore,
        action: score.action,
        demandScore: score.demandScore,
        noveltyScore: score.noveltyScore,
        competitionScore: score.competitionScore,
        marginScore: score.marginScore,
        supplierFitScore: score.supplierFitScore,
        riskPenalty: score.riskPenalty,
      },
    ];

    return {
      marketSignals,
      coupangMatches,
      trackingSnapshots,
      supplierMatches,
      scoredOpportunities,
      recommendations: [
        {
          id: 'recommendation-stub-1',
          productName,
          coupangEvidence: coupangMatches[0],
          supplierEvidence: supplierMatches[0],
          score,
          artifact: {
            title: `${productName} 테스트 발주 후보`,
            summary: {
              action: score.action,
              score: score.totalScore,
              keyword,
              category: input.category ?? null,
              productName,
              supplierName: supplierMatches[0].supplierName,
              unitPriceCny: supplierMatches[0].unitPriceCny,
              moq: supplierMatches[0].moq,
              estimatedSellPriceKrw: coupangMatches[0].priceKrw,
              estimatedLandedCostKrw: 5900,
              reasons: score.reasons,
            },
          },
        },
      ],
    };
  }
}
