import { canonicalOwnerInputJson } from '../../../../common/owner-idempotency-key';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';

export const ORDER_COLLECTION_SOURCE_PORT = Symbol('ORDER_COLLECTION_SOURCE_PORT');

/*
 * KID-379: 옛 주문 attempt 경로의 owner 포트. 카카오(`MALL_ORDER_ATTEMPT_MALLS`)만 쓴다 — 시작·읽기·제어 읽기·몰 상태
 * 목록·실패(원본 artifact + 몰 실패 알림)·중단. 완료·재변환·원본 다운로드는 없다(KID-380 T4, 카카오는 셀피아 변환 규격이
 * 없어 완료되지 않는다). 카카오가 실행 kind로 옮기면 이 포트와 저장소·라우트가 함께 사라진다.
 */

/** 옛 plan 칸. 새 시도는 `browser`만 받지만, 옮기기 전 남은 옛 행은 `manual-upload`도 있다. */
export type OrderCollectionMode = 'browser' | 'manual-upload';

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
   * 주문 수집 화면 한 장이 읽는 몰 전체의 현재 상태. 레지스트리 순서로 몰마다 한 칸이며,
   * 이 조직에 계정 행이 없는 몰은 범위와 상태를 비운 칸으로 돌려준다. 몰 하나짜리 읽기와
   * 같은 판정을 쓰고, 마찬가지로 시도 토큰은 담지 않는다.
   */
  readSourceStatuses(input: {
    organizationId: string;
  }): Promise<OrderCollectionSourceStatus[]>;

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
}
