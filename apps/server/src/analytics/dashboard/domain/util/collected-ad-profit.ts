import { measuredPercent1 } from './percent';

export interface ProfitWithAdCost {
  revenue: number;
  adCost: number;
  /** Null means the profit was not computable from available evidence. */
  netProfit: number | null;
  profitRate: number | null;
}

export interface CollectedAdSpend {
  spend: number;
  hasData: boolean;
}

/**
 * Reconciles listing-level ad spend with the separately collected Coupang
 * account daily facts. The larger measured cost wins so an incomplete source
 * cannot accidentally inflate net profit.
 *
 * A collected account spend is a measured fact, so it still replaces `adCost`
 * even when the profit itself is unavailable. It never turns an unavailable
 * profit into a number: subtracting a cost from a missing base would fabricate
 * a measured result out of absent evidence.
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

  if (metrics.netProfit === null) {
    return {
      ...metrics,
      adCost: collectedSpend,
      netProfit: null,
      profitRate: null,
    };
  }

  const netProfit = Math.round(metrics.netProfit - (collectedSpend - metrics.adCost));
  // No revenue base means no profit rate; a zero-revenue window must not
  // report a measured 0% margin.
  const profitRate = measuredPercent1(netProfit, metrics.revenue);

  return {
    ...metrics,
    adCost: collectedSpend,
    netProfit,
    profitRate,
  };
}
