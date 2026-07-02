export interface SourcingOpportunityScoreInput {
  reviewGrowth7d: number;
  rankDelta7d: number;
  sellerCount: number;
  priceKrw: number;
  estimatedLandedCostKrw: number;
  supplierConfidence: number;
  riskFlags: string[];
}

export interface SourcingOpportunityScore {
  demandScore: number;
  noveltyScore: number;
  competitionScore: number;
  marginScore: number;
  supplierFitScore: number;
  riskPenalty: number;
  totalScore: number;
  action: 'test_order' | 'hold' | 'reject';
  reasons: string[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreSourcingOpportunity(
  input: SourcingOpportunityScoreInput,
): SourcingOpportunityScore {
  const demandScore = clamp(
    input.reviewGrowth7d * 1.8 + Math.max(0, -input.rankDelta7d) * 2.2,
  );
  const noveltyScore = clamp(
    input.reviewGrowth7d > 15 && input.sellerCount < 10 ? 82 : 45,
  );
  const competitionScore = clamp(100 - input.sellerCount * 2.5);
  const marginRate =
    input.priceKrw > 0
      ? (input.priceKrw - input.estimatedLandedCostKrw) / input.priceKrw
      : 0;
  const marginScore = clamp(marginRate * 160);
  const supplierFitScore = clamp(input.supplierConfidence * 100);
  const riskPenalty = clamp(input.riskFlags.length * 18);
  const totalScore = clamp(
    demandScore * 0.26 +
      noveltyScore * 0.18 +
      competitionScore * 0.16 +
      marginScore * 0.2 +
      supplierFitScore * 0.2 -
      riskPenalty,
  );

  const reasons = [
    `7d review growth: ${input.reviewGrowth7d}`,
    `7d rank delta: ${input.rankDelta7d}`,
    `seller count: ${input.sellerCount}`,
    `estimated margin: ${Math.round(marginRate * 100)}%`,
    `supplier confidence: ${Math.round(input.supplierConfidence * 100)}%`,
  ];
  for (const flag of input.riskFlags) reasons.push(`risk: ${flag}`);

  return {
    demandScore,
    noveltyScore,
    competitionScore,
    marginScore,
    supplierFitScore,
    riskPenalty,
    totalScore,
    action: totalScore >= 75 ? 'test_order' : totalScore >= 55 ? 'hold' : 'reject',
    reasons,
  };
}
