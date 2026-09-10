// Outgoing port for the per-period profit aggregate that the dashboard
// services depend on. Sums revenue, settlement costs, ad metrics, and
// derives netProfit/profitRate against `OrderLineItem.totalPrice` (I3
// canonical). Caller scopes by organizationId; the adapter binds the same
// predicate on every read (orders + owner-published account KPI rows).

export const PROFIT_CALCULATION_REPOSITORY_PORT = Symbol(
  'ProfitCalculationRepositoryPort',
);

/** Why a per-order cost cannot be treated as a measured zero. */
export type ProfitCostIncompleteReason =
  | 'MISSING_LISTING_OPTION'
  | 'MISSING_COST_PRICE'
  | 'MISSING_PURCHASE_PRICE'
  | 'MISSING_COMMISSION_RATE'
  | 'MISSING_SHIPPING_COST'
  | 'MISSING_OTHER_COST';

export type ProfitEvidenceError = 'AD_EVIDENCE_READ_FAILED';

export interface RangeProfitMetrics {
  revenue: number;
  costOfGoods: number;
  commission: number;
  shippingCost: number;
  adCost: number;
  otherCost: number;
  netProfit: number | null;
  profitRate: number | null;
  orderCount: number;
  adRevenue: number;
  adImpressions: number;
  adClicks: number;
  adConversions: number;
  /** False means one or more order cost inputs were unavailable. */
  costComplete: boolean;
  costIncompleteReasons: ProfitCostIncompleteReason[];
  /** True only when owner-published ad rows cover every requested business day. */
  adEvidenceComplete: boolean;
  /** Present when the owner ad publication could not be read. */
  adEvidenceError?: ProfitEvidenceError;
}

/**
 * One KST business-day profit row. `adCost` is nullable because a missing ad
 * fact is different from a collected zero. `netProfit`/`profitRate` are only
 * computable when both the order and ad sources have evidence for the date and
 * every nullable order cost input is present.
 */
export interface DailyProfitMetrics {
  date: string;
  revenue: number;
  qty: number;
  costOfGoods: number;
  commission: number;
  shippingCost: number;
  otherCost: number;
  cost: number;
  adCost: number | null;
  adRevenue: number | null;
  adImpressions: number | null;
  adClicks: number | null;
  adConversions: number | null;
  netProfit: number | null;
  profitRate: number | null;
  orderCount: number;
  hasOrderEvidence: boolean;
  hasAdEvidence: boolean;
  costComplete: boolean;
  costIncompleteReasons: ProfitCostIncompleteReason[];
  /** Present when the owner ad publication could not be read. */
  adEvidenceError?: ProfitEvidenceError;
}

export interface ProfitCalculationRepositoryPort {
  calculateForRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RangeProfitMetrics>;

  calculateDailyForRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<DailyProfitMetrics[]>;
}
