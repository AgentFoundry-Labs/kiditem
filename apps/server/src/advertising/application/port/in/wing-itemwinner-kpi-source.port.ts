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

export type WingItemwinnerSourcePlan = {
  sourceType: typeof WING_ITEMWINNER_SOURCE;
  parserVersion: typeof WING_ITEMWINNER_PARSER;
  channelAccountId: string;
  expectedVendorId: string;
  businessDate: string;
  pageType: 'itemwinner';
  targetUrl: string;
};

export type WingItemwinnerCapture = {
  providerVendorId?: string | null;
  observedAt: string;
  data: Array<Record<string, unknown>>;
  kpis: Record<string, unknown>;
  url: string;
  title?: string;
  timestamp?: string;
};

export type WingItemwinnerAttempt = {
  attemptId: string;
  channelAccountId: string;
  generation: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  plan: WingItemwinnerSourcePlan;
  expiresAt: string;
  actualCutoffAt: string | null;
  observedAt: string | null;
  contentChecksum: string | null;
  itemCount: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export type WingItemwinnerSourceControl = WingItemwinnerAttempt & {
  attemptToken: string;
};

export type WingItemwinnerSourceStatus = {
  channelAccountId: string | null;
  ready: boolean;
  refreshing: boolean;
  latestAttempt: WingItemwinnerAttempt | null;
  latestComplete: WingItemwinnerAttempt | null;
  actualCutoffAt: string | null;
};

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
  begin(input: {
    organizationId: string;
    idempotencyKey: string;
    targetUrl: string;
  }): Promise<WingItemwinnerSourceControl>;
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
  readSourceStatus(input: {
    organizationId: string;
  }): Promise<WingItemwinnerSourceStatus>;
  readPublished(input: {
    organizationId: string;
  }): Promise<WingItemwinnerPublished | null>;
}
