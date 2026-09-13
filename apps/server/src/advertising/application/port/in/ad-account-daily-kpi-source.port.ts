import type {
  AdAccountDailyKpiPublished,
  AdAccountDailyKpiSourceAttempt,
  AdAccountDailyKpiSourceControl,
  AdAccountDailyKpiSourceReceipt,
  AdAccountDailyKpiSourceReceiptInput,
  AdAccountDailyKpiSourceStatus,
} from '@kiditem/shared/advertising';

export const AD_ACCOUNT_DAILY_KPI_SOURCE_PORT = Symbol(
  'AD_ACCOUNT_DAILY_KPI_SOURCE_PORT',
);

export const AD_ACCOUNT_DAILY_KPI_READ_PORT = Symbol(
  'AD_ACCOUNT_DAILY_KPI_READ_PORT',
);

export interface AdAccountDailyKpiSourcePort {
  beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    targetDate?: string;
  }): Promise<AdAccountDailyKpiSourceAttempt>;
  readSourceStatus(input: {
    organizationId: string;
  }): Promise<AdAccountDailyKpiSourceStatus>;
  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdAccountDailyKpiSourceAttempt | null>;
  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdAccountDailyKpiSourceControl | null>;
  uploadReceipt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    sequence: number;
    receipt: AdAccountDailyKpiSourceReceiptInput;
  }): Promise<AdAccountDailyKpiSourceReceipt>;
  finalizeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    manifestChecksum: string;
  }): Promise<AdAccountDailyKpiSourceStatus>;
  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<AdAccountDailyKpiSourceStatus>;
}

export interface AdAccountDailyKpiReadPort {
  /**
   * Returns the latest complete account-daily rows and the account they
   * belong to. An organization with no active advertising account answers
   * with a null account and no rows rather than throwing; an account that has
   * published nothing for the range answers with no rows, which is absent
   * evidence and never an advertising cost of zero.
   */
  readPublished(input: {
    organizationId: string;
    from?: string;
    to?: string;
  }): Promise<AdAccountDailyKpiPublished>;
}
