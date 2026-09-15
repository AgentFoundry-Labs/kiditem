import { canonicalOwnerInputJson } from '../../../../common/owner-idempotency-key';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';

export const ORDER_COLLECTION_SOURCE_PORT = Symbol('ORDER_COLLECTION_SOURCE_PORT');

export type OrderCollectionMode = 'browser' | 'manual-upload';

export type OrderCollectionConfirmedCoverage = {
  startDate: string;
  endDate: string;
};

export type OrderCollectionPlan = {
  sourceType: 'order_collection_mall';
  parserVersion: string;
  mallKey: string;
  mallName: string;
  channelAccountId: string;
  collectionDate: string | null;
  collectionMode: OrderCollectionMode;
  selectionMode?: 'manual' | 'automatic';
  seenRowKeys?: string[];
};

export type OrderCollectionAttempt = {
  attemptId: string;
  sourceImportRunId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  plan: OrderCollectionPlan;
  expiresAt: string | null;
  artifactId: string | null;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type OrderCollectionAttemptControl = OrderCollectionAttempt & {
  attemptToken: string;
};

export type OrderCollectionSourceSubmission = {
  bytes: Buffer;
  fileName: string | null;
  contentType: string;
  isFile: boolean;
};

export type OrderCollectionArtifact = {
  artifactId: string;
  sourceImportRunId: string;
  sourceFileName: string | null;
  sourceContentType: string;
  createdAt: string;
  sourceDownloadAvailable: boolean;
};

export type OrderCollectionSourceDownload = {
  bytes: Buffer;
  fileName: string | null;
  contentType: string;
};

export function orderCollectionJsonSubmission(
  payload: unknown,
  fileName: string | null = null,
): OrderCollectionSourceSubmission {
  const bytes = Buffer.from(canonicalOwnerInputJson(payload), 'utf8');
  return {
    bytes,
    fileName,
    contentType: 'application/json',
    isFile: false,
  };
}

export interface OrderCollectionSourcePort {
  beginAttempt(input: {
    organizationId: string;
    userId?: string;
    idempotencyKey: string;
    mallKey: string;
    collectionDate: string | null;
    collectionMode: OrderCollectionMode;
    selectionMode?: 'manual' | 'automatic';
    seenRowKeys?: string[];
  }): Promise<OrderCollectionAttempt & { attemptToken: string }>;

  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<OrderCollectionAttempt | null>;

  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<OrderCollectionAttemptControl | null>;

  /**
   * 공용 시작 컨트롤이 읽는 몰별 현재 상태. 진행 중 시도·마지막 완료분·마지막 시도를
   * 한 번에 돌려주며 시도 토큰은 담지 않는다.
   */
  readSourceStatus(input: {
    organizationId: string;
    mallKey: string;
  }): Promise<OrderCollectionSourceStatus>;

  validateCompletion(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    mallKey: string;
    source: OrderCollectionSourceSubmission;
    confirmedCoverage: OrderCollectionConfirmedCoverage | null;
  }): Promise<void>;

  completeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    mallKey: string;
    source: OrderCollectionSourceSubmission;
    confirmedCoverage: OrderCollectionConfirmedCoverage | null;
  }): Promise<OrderCollectionArtifact>;

  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
    source?: OrderCollectionSourceSubmission;
  }): Promise<OrderCollectionAttempt>;

  /** 화면의 중단 버튼. 토큰 없이 조직 범위로만 끝내며, 끝난 시도는 그대로 돌려준다. */
  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<OrderCollectionAttempt>;

  readSourceDownload(input: {
    organizationId: string;
    artifactId: string;
  }): Promise<OrderCollectionSourceDownload>;
}
