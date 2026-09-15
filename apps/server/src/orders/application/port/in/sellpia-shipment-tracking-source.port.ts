import { canonicalOwnerInputJson } from '../../../../common/owner-idempotency-key';

export const SELLPIA_SHIPMENT_TRACKING_SOURCE_PORT = Symbol(
  'SELLPIA_SHIPMENT_TRACKING_SOURCE_PORT',
);

export const SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE = 'sellpia_shipment_tracking' as const;
export const SELLPIA_SHIPMENT_TRACKING_PARSER_VERSION = 'sellpia-shipment-tracking-v1' as const;
export const SELLPIA_SHIPMENT_TRACKING_SOURCE_ORIGIN = 'https://kiditem.sellpia.com' as const;
export const SELLPIA_SHIPMENT_TRACKING_SOURCE_ACCOUNT_KEY = 'kiditem' as const;

export type SellpiaShipmentTrackingPlan = {
  sourceType: typeof SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE;
  parserVersion: typeof SELLPIA_SHIPMENT_TRACKING_PARSER_VERSION;
  sourceOrigin: typeof SELLPIA_SHIPMENT_TRACKING_SOURCE_ORIGIN;
  sourceAccountKey: typeof SELLPIA_SHIPMENT_TRACKING_SOURCE_ACCOUNT_KEY;
  startDate: string;
  endDate: string;
};

export type SellpiaShipmentTrackingAttempt = {
  attemptId: string;
  sourceImportRunId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  plan: SellpiaShipmentTrackingPlan;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  expiresAt: string | null;
  artifactId: string | null;
  sourceFileName: string | null;
  sourceContentType: string | null;
  contentChecksum: string | null;
  sourceByteCount: number | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type SellpiaShipmentTrackingAttemptControl = SellpiaShipmentTrackingAttempt & {
  attemptToken: string;
};

export type SellpiaShipmentTrackingSourceSubmission = {
  bytes: Buffer;
  fileName: string | null;
  contentType: string;
};

export type SellpiaShipmentTrackingSourceDownload = {
  bytes: Buffer;
  fileName: string | null;
  contentType: string;
};

export function sellpiaShipmentTrackingJsonSubmission(
  payload: unknown,
  fileName = 'sellpia-shipment-tracking-v1.json',
): SellpiaShipmentTrackingSourceSubmission {
  const bytes = Buffer.from(canonicalOwnerInputJson(payload), 'utf8');
  return {
    bytes,
    fileName,
    contentType: 'application/json',
  };
}

export interface SellpiaShipmentTrackingSourcePort {
  beginAttempt(input: {
    organizationId: string;
    userId?: string;
    idempotencyKey: string;
    startDate: string;
    endDate: string;
  }): Promise<SellpiaShipmentTrackingAttemptControl>;

  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaShipmentTrackingAttempt | null>;

  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaShipmentTrackingAttemptControl | null>;

  completeAttempt(input: {
    organizationId: string;
    userId?: string;
    attemptId: string;
    attemptToken: string;
    source: SellpiaShipmentTrackingSourceSubmission;
  }): Promise<SellpiaShipmentTrackingAttempt>;

  failAttempt(input: {
    organizationId: string;
    userId?: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<SellpiaShipmentTrackingAttempt>;

  /** 화면의 중단 버튼. 토큰 없이 조직 범위로만 끝내며, 끝난 시도는 그대로 돌려준다. */
  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaShipmentTrackingAttempt>;

  readSourceDownload(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaShipmentTrackingSourceDownload>;
}
