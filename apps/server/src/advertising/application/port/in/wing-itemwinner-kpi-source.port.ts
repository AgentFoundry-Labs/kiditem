import type {
  WingItemwinnerSourceAttempt,
  WingItemwinnerSourcePlan as SharedWingItemwinnerSourcePlan,
  WingItemwinnerSourceStatus as SharedWingItemwinnerSourceStatus,
} from '@kiditem/shared/advertising';

/**
 * Incoming capability for the single-page Coupang Wing item-winner source.
 *
 * The browser submits only a raw current-page capture. The owner derives the
 * normalized KPI and listing/option facts inside its terminal transaction.
 */

export const WING_ITEMWINNER_KPI_SOURCE_PORT = Symbol(
  'WingItemwinnerKpiSourcePort',
);
export const WING_ITEMWINNER_KPI_READ_PORT = Symbol(
  'WingItemwinnerKpiReadPort',
);

export const WING_ITEMWINNER_SOURCE = 'coupang_wing_itemwinner' as const;
export const WING_ITEMWINNER_PARSER = 'wing-itemwinner-v1' as const;

/**
 * The Wing seller price-management page that lists item winners. The owner
 * freezes it into the plan at admission: a start carries only the account, so
 * no caller decides the page, and the extension opens `plan.targetUrl` and
 * must report exactly that page in the capture.
 */
export const WING_ITEMWINNER_TARGET_URL =
  'https://wing.coupang.com/tenants/seller-price-management' as const;

/** Plan, attempt and status views are the shared `@kiditem/shared/advertising` contract. */
export type WingItemwinnerSourcePlan = SharedWingItemwinnerSourcePlan;

export type WingItemwinnerCapture = {
  providerVendorId?: string | null;
  observedAt: string;
  data: Array<Record<string, unknown>>;
  kpis: Record<string, unknown>;
  url: string;
  title?: string;
  timestamp?: string;
};

export type WingItemwinnerAttempt = WingItemwinnerSourceAttempt;

export type WingItemwinnerSourceControl = WingItemwinnerAttempt & {
  attemptToken: string;
};

export type WingItemwinnerSourceStatus = SharedWingItemwinnerSourceStatus;

export type WingItemwinnerListingObservation = {
  listingId: string;
  isOfferWinner: boolean | null;
  lastObservedAt: string;
};

export type WingItemwinnerPublished = {
  channelAccountId: string;
  attemptId: string;
  generation: string;
  businessDate: string;
  observedAt: string;
  normalizedJson: Record<string, unknown>;
  /** Immutable listing-level observations captured by this COMPLETE attempt. */
  listingObservations: WingItemwinnerListingObservation[];
};

export interface WingItemwinnerKpiSourcePort {
  /** One RUNNING attempt per account; the primary account when none is named. */
  begin(input: {
    organizationId: string;
    idempotencyKey: string;
    channelAccountId?: string;
  }): Promise<WingItemwinnerSourceControl>;
  /** Operator stop without the attempt token; a terminal attempt is returned unchanged. */
  cancel(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<WingItemwinnerAttempt>;
  read(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<WingItemwinnerSourceControl | null>;
  complete(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    capture: WingItemwinnerCapture;
  }): Promise<WingItemwinnerSourceControl>;
  fail(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<WingItemwinnerSourceControl>;
}

export interface WingItemwinnerKpiReadPort {
  /** The named account's attempts, or the primary account's when none is named. */
  readSourceStatus(input: {
    organizationId: string;
    channelAccountId?: string;
  }): Promise<WingItemwinnerSourceStatus>;
  readPublished(input: {
    organizationId: string;
  }): Promise<WingItemwinnerPublished | null>;
}
