import {
  OPERATION_LEASE_MS,
  isOperationTerminal,
  type OperationFenceLostReason,
  type OperationStatus,
} from '@kiditem/shared/operation';

/** 임대가 만료로 닫은 실행이 남기는 오류 코드·문장. 이후 fenced 쓰기도 `expired`로 답한다. */
export const OPERATION_EXPIRED_ERROR_CODE = 'OPERATION_FENCE_LOST' as const;
export const OPERATION_EXPIRED_ERROR_MESSAGE: OperationFenceLostReason = 'expired';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 임대: 마지막 fenced 쓰기부터 30분(ADR-0025). */
export function leaseExpiresAt(now: Date): Date {
  return new Date(now.getTime() + OPERATION_LEASE_MS);
}

export function isLeaseExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export interface FencedOperationState {
  status: OperationStatus;
  token: string;
  expiresAt: Date;
  errorCode: string | null;
  errorMessage: string | null;
}

export type OperationFenceVerdict =
  | { verdict: 'admit' }
  /** 토큰이 틀리면 그 실행을 "찾을 수 없다"로 답해 토큰이 맞는지 드러내지 않는다. */
  | { verdict: 'not_found' }
  /** `expire`면 거절하기 전에 그 실행을 만료로 닫아 커밋해야 한다. */
  | { verdict: 'reject'; reason: Exclude<OperationFenceLostReason, 'chunk_conflict'>; expire: boolean };

export function closedByExpiry(state: Pick<FencedOperationState, 'status' | 'errorCode' | 'errorMessage'>): boolean {
  return state.status === 'failed'
    && state.errorCode === OPERATION_EXPIRED_ERROR_CODE
    && state.errorMessage === OPERATION_EXPIRED_ERROR_MESSAGE;
}

/** 토큰을 든 fenced 쓰기(chunk·finish)의 판정. */
export function evaluateOperationFence(
  state: FencedOperationState,
  presentedToken: string | undefined,
  now: Date,
): OperationFenceVerdict {
  if (!presentedToken || !UUID.test(presentedToken) || presentedToken.toLowerCase() !== state.token.toLowerCase()) {
    return { verdict: 'not_found' };
  }
  if (isOperationTerminal(state.status)) {
    return { verdict: 'reject', reason: closedByExpiry(state) ? 'expired' : 'terminal', expire: false };
  }
  if (isLeaseExpired(state.expiresAt, now)) return { verdict: 'reject', reason: 'expired', expire: true };
  return { verdict: 'admit' };
}
