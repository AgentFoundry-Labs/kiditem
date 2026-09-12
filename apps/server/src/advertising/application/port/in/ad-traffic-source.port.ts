import type {
  AdTrafficSourceAttempt,
  AdTrafficSourceBegin,
  AdTrafficSourceControl,
  AdTrafficSourcePublished,
  AdTrafficSourceReceipt,
  AdTrafficSourceReceiptInput,
  AdTrafficSourceStatus,
} from '@kiditem/shared/advertising';

export const AD_TRAFFIC_SOURCE_PORT = Symbol('AD_TRAFFIC_SOURCE_PORT');
export const AD_TRAFFIC_READ_PORT = Symbol('AD_TRAFFIC_READ_PORT');

export interface AdTrafficSourcePort {
  beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    request: AdTrafficSourceBegin;
  }): Promise<AdTrafficSourceAttempt>;
  readSourceStatus(input: {
    organizationId: string;
    channelAccountId?: string;
  }): Promise<AdTrafficSourceStatus>;
  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdTrafficSourceAttempt | null>;
  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdTrafficSourceControl | null>;
  uploadReceipt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    sequence: number;
    receipt: AdTrafficSourceReceiptInput;
  }): Promise<AdTrafficSourceReceipt>;
  finalizeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    manifestChecksum: string;
  }): Promise<AdTrafficSourceStatus>;
  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<AdTrafficSourceStatus>;
}

export interface AdTrafficReadPort {
  readPublished(input: {
    organizationId: string;
    channelAccountId?: string;
    from?: string;
    to?: string;
  }): Promise<AdTrafficSourcePublished>;
}
