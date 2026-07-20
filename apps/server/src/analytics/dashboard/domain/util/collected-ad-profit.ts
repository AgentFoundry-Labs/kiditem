import { pct1 } from './percent';

export interface ProfitWithAdCost {
  revenue: number;
  adCost: number;
  netProfit: number;
  profitRate: number;
}

export interface CollectedAdSpend {
  spend: number;
  hasData: boolean;
}

/**
 * Reconciles listing-level ad spend with the separately collected Coupang
 * account daily facts. The larger measured cost wins so an incomplete source
 * cannot accidentally inflate net profit.
 */
export function reconcileCollectedAdSpend<T extends ProfitWithAdCost>(
  metrics: T,
  collected: CollectedAdSpend,
): T {
  if (!collected.hasData) return metrics;

  const collectedSpend = Number.isFinite(collected.spend)
    ? Math.max(0, Math.round(collected.spend))
    : 0;
  if (collectedSpend <= metrics.adCost) return metrics;

  const netProfit = Math.round(metrics.netProfit - (collectedSpend - metrics.adCost));
  const profitRate = pct1(netProfit, metrics.revenue);

  return {
    ...metrics,
    adCost: collectedSpend,
    netProfit,
    profitRate,
  };
}
