import type {
  CoupangDirectCenter,
  CoupangDirectOrderCollectionRequest,
  CoupangDirectPurchaseOrder,
} from '@kiditem/shared/coupang-direct-order';

export const COUPANG_DIRECT_SOURCE_TYPE = 'coupang_direct_order_capture' as const;
export const COUPANG_DIRECT_PARSER_VERSION = 'coupang-direct-order-v1' as const;

export type CoupangDirectCapture = {
  channelAccountId: string;
  centers: Record<string, CoupangDirectCenter>;
  pos: CoupangDirectPurchaseOrder[];
};

export type CoupangDirectCapturePlan = {
  sourceType: typeof COUPANG_DIRECT_SOURCE_TYPE;
  parserVersion: typeof COUPANG_DIRECT_PARSER_VERSION;
  channelAccountId: string;
  captureMode: 'browser';
  transportScope: 'ALL';
};

export type CoupangDirectOwnerAttempt = {
  attemptId: string;
  sourceImportRunId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  plan: CoupangDirectCapturePlan;
  expiresAt: string | null;
  artifactId: string | null;
  contentChecksum: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type CoupangDirectOwnerAttemptControl = CoupangDirectOwnerAttempt & {
  attemptToken: string;
};

/** 수집·워크북 연결 상태를 (poNumber=발주번호, productNo=SKU) 식별자로 보고한다. */
export type CoupangDirectCollectionLineRef = {
  poNumber: string;
  productNo: string;
};

export type CoupangDirectTransportReceipt = {
  transport: 'SHIPMENT' | 'MILKRUN';
  payloadChecksum: string;
  sourceImportRunId: string;
  exportId: string | null;
  transmissionIntentKey: string | null;
  matchedLineCount: number;
  reconciledRows: number;
  collectedLines: CoupangDirectCollectionLineRef[];
  matchedLines: CoupangDirectCollectionLineRef[];
  unmatchedLines: CoupangDirectCollectionLineRef[];
  duplicate: boolean;
};

export type CoupangDirectTransport = 'SHIPMENT' | 'MILKRUN';

export type CoupangDirectProjection = {
  importRunId: string;
  request: CoupangDirectOrderCollectionRequest;
  receipt: CoupangDirectTransportReceipt;
};

export interface CoupangDirectOrderCollectionPort {
  beginAttempt(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    idempotencyKey: string;
  }): Promise<CoupangDirectOwnerAttemptControl>;

  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<CoupangDirectOwnerAttempt | null>;

  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<CoupangDirectOwnerAttemptControl | null>;

  completeAttempt(input: {
    organizationId: string;
    userId: string;
    attemptId: string;
    attemptToken: string;
    capture: CoupangDirectCapture;
  }): Promise<CoupangDirectOwnerAttempt>;

  consumeAttempt(input: {
    organizationId: string;
    userId: string;
    attemptId: string;
    attemptToken: string;
    capture: CoupangDirectCapture;
    transport: CoupangDirectTransport;
  }): Promise<CoupangDirectTransportReceipt>;

  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<CoupangDirectOwnerAttempt>;

  readCaptured(input: {
    organizationId: string;
    attemptId: string;
    channelAccountId?: string;
  }): Promise<{ attempt: CoupangDirectOwnerAttempt; capture: CoupangDirectCapture }>;

  readProjection(input: {
    organizationId: string;
    attemptId: string;
    transport: 'SHIPMENT' | 'MILKRUN';
  }): Promise<CoupangDirectProjection>;

}

export const COUPANG_DIRECT_ORDER_COLLECTION_PORT = Symbol(
  'COUPANG_DIRECT_ORDER_COLLECTION_PORT',
);
