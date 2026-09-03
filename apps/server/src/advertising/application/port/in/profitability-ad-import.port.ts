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
  status: 'READY' | 'STALE' | 'MISSING';
}>;

export type AdvertisingProfitabilityFrozenRecipePolicy = Readonly<{
  version: 'WHOLE_RECIPE_QUANTITY_V1';
  allocation: 'INTEGER_KRW_LARGEST_REMAINDER';
  tieBreak: 'MASTER_PRODUCT_ID_ASC_LOWERCASE';
  mappingGeneration: string;
  adSourcePolicyHash: string;
}>;

export type AdvertisingProfitabilityQualitySummary = Readonly<{
  contract: string | null;
  parserVersion: string | null;
  plannedAccountCount: number;
  plannedSliceCount: number;
  receiptCount: number;
  targetFactCount: number;
  matchedTargetCount: number;
  unmatchedTargetCount: number;
  allocatableTargetCount: number;
  unallocatableTargetCount: number;
  monthlyAllocationFactCount: number;
  reportIdCount: number;
  campaignCount: number;
  expectedRowCount: number;
  collectedRowCount: number;
  responseBytes: number;
  providerSpendKrw: number;
  allocatedSpendKrw: number;
  unmatchedSpendKrw: number;
  unallocatableSpendKrw: number;
}>;

export type AdvertisingProfitabilityGenerationSummary = Readonly<{
  sourceImportRunId: string;
  sourceType: 'coupang_ad_profitability';
  organizationId: string;
  publicationSequence: string;
  coverageStartDate: string;
  coveredThrough: string;
  capturedAt: string;
  mappingGeneration: string;
  adSourcePolicyHash: string;
  frozenRecipePolicy: AdvertisingProfitabilityFrozenRecipePolicy;
  qualitySummary: AdvertisingProfitabilityQualitySummary;
}>;

export type AdvertisingProfitabilityGeneration = Readonly<{
  summary: AdvertisingProfitabilityGenerationSummary;
  facts: readonly {
    channelAccountId: string;
    channelListingId: string | null;
    channelListingOptionId: string | null;
    businessDate: string;
    externalId: string | null;
    externalOptionId: string;
    adSpend: number;
    adRevenue: number;
    impressions: number;
    clicks: number;
    orders: number;
    conversions: number;
    matched: boolean;
    allocationStatus: 'ALLOCATABLE' | 'UNMATCHED' | 'UNALLOCATABLE';
  }[];
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
  status: 'READY' | 'STALE' | 'MISSING';
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
}
