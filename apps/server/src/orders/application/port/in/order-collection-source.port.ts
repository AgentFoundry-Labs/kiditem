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

  /**
   * 주문 수집 화면 한 장이 읽는 몰 전체의 현재 상태. 레지스트리 순서로 몰마다 한 칸이며,
   * 이 조직에 계정 행이 없는 몰은 범위와 상태를 비운 칸으로 돌려준다. 몰 하나짜리 읽기와
   * 같은 판정을 쓰고, 마찬가지로 시도 토큰은 담지 않는다.
   */
  readSourceStatuses(input: {
    organizationId: string;
  }): Promise<OrderCollectionSourceStatus[]>;

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

  /**
   * 이 수집이 실어 온 주문이 몇 줄인지 장부에 적는다.
   *
   * 완료 시점에는 원본 바이트만 있어 몇 건인지 모른다 — 셀피아 양식으로 **변환할 때** 비로소
   * 안다. 그래서 몰 수집은 성공해도 `row_count` 가 0 으로 남았고, 대시보드의 '오늘 주문' 이
   * 그만큼 모자랐다(사장님 2026-09-21). 변환은 여러 번 불릴 수 있으므로 같은 값을 다시 적는
   * 것은 아무 일도 아니다.
   */
  recordCollectedRows(input: {
    organizationId: string;
    attemptId: string;
    rowCount: number;
  }): Promise<void>;
}
