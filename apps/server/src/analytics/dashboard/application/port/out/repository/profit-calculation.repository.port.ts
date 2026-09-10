// Outgoing port for the per-period profit aggregate that the dashboard
// services depend on. Sums revenue, settlement costs, ad metrics, and
// derives netProfit/profitRate against `OrderLineItem.totalPrice` (I3
// canonical). Caller scopes by organizationId; the adapter binds the same
// predicate on every read (orders + owner-published account KPI rows).

import type { AdAccountDailyKpiPublishedEvidence } from '@kiditem/shared/advertising';
import type { ResolvedDashboardPeriod } from '../../../../domain/period/dashboard-period';

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

/**
 * Per-source KST business-date evidence behind one range aggregate. Every
 * array is sorted ascending, unique, and `YYYY-MM-DD`; `orderDates` and
 * `adDates` are always subsets of `requestedDates`. A source that could not be
 * read reports no dates — read the matching evidence error to tell that apart
 * from a source that genuinely published nothing.
 */
export interface ProfitSourceCoverage {
  /** Contiguous KST business dates the window covers. */
  requestedDates: string[];
  /** Business dates carrying at least one admitted order row. */
  orderDates: string[];
  /**
   * Business dates with a published account ad KPI row. Ad dates are never
   * fabricated to satisfy a coverage equality: under `NOT_APPLIED` there is no
   * account that could publish anything, so this stays empty and the period's
   * calculation basis names orders alone rather than claiming Coupang ads
   * covered the window.
   */
  adDates: string[];
  /**
   * How to read `adDates`, in the Advertising owner's own vocabulary. An empty
   * `adDates` is a gap under `MISSING` — including when the owner was never
   * asked or the read failed, which `adEvidenceError` separates — and the
   * complete answer under `NOT_APPLIED`; a consumer building a per-metric
   * calculation basis reads this word rather than the array's length.
   */
  adEvidence: AdAccountDailyKpiPublishedEvidence;
}

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
  /**
   * True when advertising is a satisfied input for the window: either the
   * owner published a row for every requested business day, or advertising
   * does not apply to this organization (`NOT_APPLIED`). `MISSING` and a
   * failed read are never satisfied.
   */
  adEvidenceComplete: boolean;
  /** Present when the owner ad publication could not be read. */
  adEvidenceError?: ProfitEvidenceError;
  /** Business dates each source actually covers inside the window. */
  sourceCoverage: ProfitSourceCoverage;
}

/**
 * One KST business-day profit row. `adCost` is nullable because a missing ad
 * fact is different from a collected zero. `netProfit`/`profitRate` are only
 * computable when the order source has evidence for the date, every nullable
 * order cost input is present, and advertising is either evidenced for the
 * date or does not apply to the organization at all.
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
  /**
   * How the owner answered for the window this row belongs to. Under
   * `NOT_APPLIED` the ad values are a genuine zero with `hasAdEvidence` still
   * false: there is no ad fact, because there is no advertising account.
   */
  adEvidence: AdAccountDailyKpiPublishedEvidence;
  /** Present when the owner ad publication could not be read. */
  adEvidenceError?: ProfitEvidenceError;
}

export interface ProfitCalculationRepositoryPort {
  calculateForRange(
    organizationId: string,
    period: ResolvedDashboardPeriod,
  ): Promise<RangeProfitMetrics>;

  calculateDailyForRange(
    organizationId: string,
    period: ResolvedDashboardPeriod,
  ): Promise<DailyProfitMetrics[]>;
}
