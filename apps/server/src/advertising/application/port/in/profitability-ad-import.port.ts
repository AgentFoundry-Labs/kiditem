export const PROFITABILITY_AD_IMPORT_PORT = Symbol(
  'PROFITABILITY_AD_IMPORT_PORT',
);

export const ADVERTISING_PROFITABILITY_READ_PORT = Symbol(
  'ADVERTISING_PROFITABILITY_READ_PORT',
);

export type AdvertisingProfitabilityPlan = Readonly<{
  attemptId: string;
  attemptToken: string;
  expiresAt: string;
  mappingGeneration: string;
  adSourcePolicyHash: string;
  accounts: readonly {
    channelAccountId: string;
    externalAccountId: string;
    expectedAdvertiserId: string;
    slices: readonly {
      sliceId: string;
      from: string;
      to: string;
      businessDates: readonly string[];
    }[];
  }[];
}>;

export type AdvertisingProfitabilityProviderRow = Readonly<{
  businessDate: string;
  externalOptionId: string;
  adSpend: number;
  impressions: number;
  clicks: number;
  orders: number;
  conversions: number;
  adRevenue: number;
}>;

export type AdvertisingProfitabilitySliceUpload = Readonly<{
  organizationId: string;
  attemptId: string;
  attemptToken: string;
  sliceId: string;
  sequence: number;
  checksum: string;
  providerAdvertiserId: string;
  reportId: string;
  campaignCount: number;
  expectedRowCount: number;
  collectedRowCount: number;
  responseBytes: number;
  rows: readonly AdvertisingProfitabilityProviderRow[];
}>;

export type AdvertisingProfitabilitySourceView = Readonly<{
  latestAttempt: {
    attemptId: string;
    state: 'RUNNING' | 'COMPLETE' | 'FAILED';
    startedAt: string;
    capturedAt: string | null;
    expiresAt: string;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
  latestComplete: {
    sourceImportRunId: string;
    publicationSequence: string;
    mappingGeneration: string;
    coveredThrough: string;
    capturedAt: string;
    qualitySummary: AdvertisingProfitabilityQualitySummary;
  } | null;
  ready: boolean;
}>;

export type AdvertisingProfitabilityFrozenRecipePolicy = Readonly<{
  version: 'WHOLE_RECIPE_QUANTITY_V1';
  allocation: 'INTEGER_KRW_LARGEST_REMAINDER';
  tieBreak: 'MASTER_PRODUCT_ID_ASC_LOWERCASE';
  mappingGeneration: string;
  adSourcePolicyHash: string;
}>;

/**
 * Quality counts of a completed profitability import. An import that holds its
 * closed day as unreported publishes only through `coveredThrough`, so each
 * count names its basis: the plan, the upload (every receipt, the held day
 * included) or the publication (the held day left out). The run's
 * `providerBackedEmptyProof` is on the published basis too.
 */
export type AdvertisingProfitabilityQualitySummary = Readonly<{
  contract: string | null;
  parserVersion: string | null;
  /** Plan: the accounts the attempt requested. */
  plannedAccountCount: number;
  /** Plan: the slices the attempt requested. */
  plannedSliceCount: number;
  /** Upload: the receipts, one per planned slice. */
  receiptCount: number;
  /** Published: the target rows through `coveredThrough`, matched or not. */
  targetFactCount: number;
  /** Published: the target rows matched to a listing. */
  matchedTargetCount: number;
  /** Published: the target rows matched to no listing. */
  unmatchedTargetCount: number;
  /** Published: the matched target rows a monthly fact covers. */
  allocatableTargetCount: number;
  /** Published: the matched target rows no monthly fact covers. */
  unallocatableTargetCount: number;
  /** Published: the monthly allocation facts. */
  monthlyAllocationFactCount: number;
  /** Upload: the provider report ids, one per receipt. */
  reportIdCount: number;
  /** Upload: the campaigns in the receipts' reports. */
  campaignCount: number;
  /** Upload: the rows the receipts' reports declared. */
  expectedRowCount: number;
  /** Upload: the rows the receipts collected. */
  collectedRowCount: number;
  /** Upload: the receipts' response bytes. */
  responseBytes: number;
  /** Published: the spend on the published target rows. */
  providerSpendKrw: number;
  /** Published: the spend allocated to the monthly facts. */
  allocatedSpendKrw: number;
  /** Published: the spend on unmatched target rows. */
  unmatchedSpendKrw: number;
  /** Published: the spend on unallocatable target rows. */
  unallocatableSpendKrw: number;
}>;

export type AdvertisingProfitabilityGenerationSummary = Readonly<{
  sourceImportRunId: string;
  sourceType: 'coupang_ad_profitability';
  organizationId: string;
  publicationSequence: string;
  coverageStartDate: string;
  coveredThrough: string;
  /**
   * The last day the generation's plan requested: `coveredThrough`, or the
   * closed day after it when the import held that day as unreported.
   */
  requestedThrough: string;
  capturedAt: string;
  mappingGeneration: string;
  adSourcePolicyHash: string;
  frozenRecipePolicy: AdvertisingProfitabilityFrozenRecipePolicy;
  qualitySummary: AdvertisingProfitabilityQualitySummary;
}>;

export type AdvertisingProfitabilityGeneration = Readonly<{
  summary: AdvertisingProfitabilityGenerationSummary;
  allocations: readonly {
    channelAccountId: string;
    channelListingId: string;
    masterProductId: string;
    month: string;
    coveredStartDate: string;
    coveredEndDate: string;
    wholeRecipeWeight: number;
    allocatedSpend: number;
    observedTargetDayCount: number;
    mappingGeneration: string;
  }[];
}>;

export type AdvertisingProfitabilitySourceSnapshot = Readonly<{
  latestAttempt: Readonly<{
    attemptId: string;
    sourceImportRunId: string;
    state: 'RUNNING' | 'COMPLETE' | 'FAILED';
    startedAt: string;
    capturedAt: string | null;
    expiresAt: string;
    errorCode: string | null;
    errorMessage: string | null;
    mappingGeneration: string | null;
    adSourcePolicyHash: string | null;
    coverageStartDate: string | null;
    coverageEndDate: string | null;
  }> | null;
  latestComplete: AdvertisingProfitabilityGenerationSummary | null;
  completeGenerations: readonly AdvertisingProfitabilityGenerationSummary[];
  ready: boolean;
}>;

export interface AdvertisingProfitabilityReadPort {
  readGeneration(input: {
    organizationId: string;
    sourceImportRunId: string;
  }): Promise<AdvertisingProfitabilityGeneration | null>;
  /**
   * Read source status and a bounded history of exact complete generations.
   * Finance consumes this seam and never imports Prisma or an Advertising
   * adapter to choose a compatible prior generation.
   */
  readSourceSnapshot(input: {
    organizationId: string;
    limit?: number;
  }): Promise<AdvertisingProfitabilitySourceSnapshot>;
}

export type AttemptFence = Readonly<{
  organizationId: string;
  attemptId: string;
  attemptToken: string;
}>;

export interface ProfitabilityAdImportPort {
  beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
  }): Promise<AdvertisingProfitabilityPlan>;
  readSourceStatus(input: {
    organizationId: string;
  }): Promise<AdvertisingProfitabilitySourceView>;
  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdvertisingProfitabilityPlan | null>;
  uploadSlice(
    input: AdvertisingProfitabilitySliceUpload,
  ): Promise<{ replayed: boolean }>;
  finalizeAttempt(
    input: AttemptFence,
  ): Promise<AdvertisingProfitabilitySourceView>;
  failAttempt(
    input: AttemptFence & {
      code: string;
      message: string;
    },
  ): Promise<AdvertisingProfitabilitySourceView>;
  /** Operator stop without the attempt token; a terminal attempt is left unchanged. */
  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdvertisingProfitabilitySourceView>;
}
