import type { ProductListItem as Product } from './product-types';

export interface GradeInfo {
  score: number;
  grade: string;
  rank: number;
  prevRank: number | null;
  strategy: string;
}

export type GradeMap = Map<string, GradeInfo>;

function isGradeEligible(product: Product): boolean {
  return Boolean(product.listingId);
}

/**
 * Compute ABC grades + ranks + strategy notes from t14/t14prev traffic data.
 * Pure function — no React, no side effects.
 */
export function computeGradeMap(products: Product[]): GradeMap {
  const map: GradeMap = new Map();
  const evaluableProducts = products.filter(isGradeEligible);

  const withRev = evaluableProducts
    .map(p => ({ id: p.id, rev: p.t14?.revenue || 0 }))
    .filter(p => p.rev > 0)
    .sort((a, b) => b.rev - a.rev);
  const totalRev = withRev.reduce((s, p) => s + p.rev, 0);
  const revenueScoreMap = new Map<string, number>();
  let cum = 0;
  for (const p of withRev) {
    cum += p.rev;
    const pct = totalRev > 0 ? (cum / totalRev) * 100 : 100;
    revenueScoreMap.set(p.id, pct <= 70 ? 50 : pct <= 90 ? 30 : 10);
  }

  const prevWithRev = evaluableProducts
    .map(p => ({ id: p.id, rev: p.t14prev?.revenue || 0 }))
    .filter(p => p.rev > 0)
    .sort((a, b) => b.rev - a.rev);
  const prevRankMap = new Map<string, number>();
  prevWithRev.forEach((p, i) => prevRankMap.set(p.id, i + 1));

  const scored = evaluableProducts.map(p => {
    const createdAt = p.createdAt ? new Date(p.createdAt).getTime() : 0;
    const isNewProduct = createdAt > 0 && Date.now() - createdAt <= 30 * 24 * 60 * 60 * 1000;
    const revScore = revenueScoreMap.get(p.id) || (isNewProduct ? 15 : 0);
    const conv = p.t14?.conversionRate || 0;
    let convScore = 0;
    if (conv >= 5) convScore = 20;
    else if (conv >= 3) convScore = 15;
    else if (conv >= 1) convScore = 10;
    else if (conv > 0) convScore = 5;
    const cartRate = (p.t14?.views || 0) > 0 ? ((p.t14?.cartAdds || 0) / (p.t14?.views || 1)) * 100 : 0;
    let interestScore = 0;
    if (cartRate >= 3) interestScore = 10;
    else if (cartRate >= 1) interestScore = 6;
    else if (cartRate > 0) interestScore = 3;
    let profitScore = 0;
    if (p.profitRate < 0) profitScore = -15;
    else if (p.profitRate >= 15) profitScore = 10;
    else if (p.profitRate >= 7) profitScore = 7;
    else if (p.profitRate >= 3) profitScore = 4;
    let total = revScore + convScore + interestScore + profitScore;
    if (isNewProduct && (p.t14?.revenue || 0) <= 0) {
      total = Math.max(total, (p.t14?.views || 0) > 0 || (p.t14?.cartAdds || 0) > 0 ? 42 : 35);
    }
    total = Math.max(0, Math.min(100, Math.round(total)));
    let grade = 'C';
    if (total >= 70 && (p.t14?.revenue || 0) > 0) grade = 'A';
    else if (total >= 40 || (isNewProduct && total >= 35)) grade = 'B';
    return { id: p.id, score: total, grade, revScore };
  });

  const ranked = scored.filter(s => s.revScore > 0).sort((a, b) => b.score - a.score);
  ranked.forEach((s, i) => {
    const p = products.find(pp => pp.id === s.id)!;
    const rank = i + 1;
    const prevRank = prevRankMap.get(s.id) || null;
    let strategy = '';
    const isAdvertising = p.isAdvertising ?? Boolean(p.adTier);
    if (s.grade === 'A' && isAdvertising) strategy = '핵심 상품 — 광고 유지 추천';
    else if (s.grade === 'A') strategy = '자연매출 우수 — 광고 테스트 시 A급 후보';
    else if (s.grade === 'B' && isAdvertising) strategy = '키워드 최적화 필요 — 소재 변경 또는 입찰가 조정';
    else if (s.grade === 'B') strategy = '성장 가능성 — A등급 승격 조건 검토';
    else strategy = '매출 개선 필요';
    map.set(s.id, { score: s.score, grade: s.grade, rank, prevRank, strategy });
  });

  scored.filter(s => s.revScore === 0).forEach(s => {
    const p = products.find(pp => pp.id === s.id)!;
    const isAdvertising = p.isAdvertising ?? Boolean(p.adTier);
    const strategy = isAdvertising ? '광고 중단 권장 — 매출 없음' : '판매 이력 없음';
    map.set(s.id, { score: 0, grade: 'C', rank: 0, prevRank: null, strategy });
  });

  return map;
}

export function gradeOf(p: Product, m: GradeMap): string {
  if (!isGradeEligible(p)) return '평가대기';
  return p.abcGrade || m.get(p.id)?.grade || 'C';
}
export function rankOf(p: Product, m: GradeMap): number {
  if (!isGradeEligible(p)) return 0;
  return p.gradeRank || m.get(p.id)?.rank || 0;
}
export function rankChangeOf(p: Product, m: GradeMap): number | null {
  if (!isGradeEligible(p)) return null;
  if (p.gradeRank !== undefined) {
    return p.gradeRank && p.prevGradeRank ? p.prevGradeRank - p.gradeRank : null;
  }
  const info = m.get(p.id);
  if (!info || !info.prevRank || !info.rank) return null;
  return info.prevRank - info.rank;
}
export function strategyOf(p: Product, m: GradeMap): string {
  if (!isGradeEligible(p)) return '채널 연결 후 성과 평가 가능';
  return p.gradeStrategy || m.get(p.id)?.strategy || '';
}
export function scoreOf(p: Product, m: GradeMap): number {
  if (!isGradeEligible(p)) return 0;
  return p.gradeScore ?? m.get(p.id)?.score ?? 0;
}
