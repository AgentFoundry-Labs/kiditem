import type {
  AdvertisingProfitabilityGeneration,
  AdvertisingProfitabilityPlan,
  AdvertisingProfitabilitySliceUpload,
  AdvertisingProfitabilitySourceSnapshot,
  AdvertisingProfitabilitySourceView,
  AttemptFence,
} from '../../in/profitability-ad-import.port';

export const PROFITABILITY_AD_IMPORT_REPOSITORY_PORT = Symbol(
  'PROFITABILITY_AD_IMPORT_REPOSITORY_PORT',
);

export interface ProfitabilityAdImportRepositoryPort {
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
  readGeneration(input: {
    organizationId: string;
    sourceImportRunId: string;
  }): Promise<AdvertisingProfitabilityGeneration | null>;
  readSourceSnapshot(input: {
    organizationId: string;
    limit?: number;
  }): Promise<AdvertisingProfitabilitySourceSnapshot>;
  uploadSlice(
    input: AdvertisingProfitabilitySliceUpload,
  ): Promise<{ replayed: boolean }>;
  finalizeAttempt(input: AttemptFence): Promise<AdvertisingProfitabilitySourceView>;
  failAttempt(input: AttemptFence & {
    code: string;
    message: string;
  }): Promise<AdvertisingProfitabilitySourceView>;
  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdvertisingProfitabilitySourceView>;
}
