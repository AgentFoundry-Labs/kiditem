import type { OperationStatus } from '@kiditem/shared/operation';
import { isLeaseExpired } from './operation-fence';

/** claim 판정에 필요한 실행 한 행의 값(KID-358). */
export interface ClaimableOperationState {
  status: OperationStatus;
  attempts: number;
  maxAttempts: number;
  scheduledFor: Date | null;
  expiresAt: Date;
}

/**
 * claim 후보: 시도가 남아 있고(`attempts < maxAttempts`), `prepared`이면서 예정 시각이 지났거나 없는 실행,
 * 또는 `executing`인데 임대가 끝난 실행. 저장소의 claim 질의가 같은 조건을 SQL로 건다.
 */
export function isClaimable(state: ClaimableOperationState, now: Date): boolean {
  if (state.attempts >= state.maxAttempts) return false;
  if (state.status === 'prepared') return state.scheduledFor === null || state.scheduledFor.getTime() <= now.getTime();
  if (state.status === 'executing') return isLeaseExpired(state.expiresAt, now);
  return false;
}

export type FailureDisposition = { retry: true; scheduledFor: Date } | { retry: false };

/**
 * 실패한 시도의 처분. 시도가 남아 있고 호출자가 재시도 간격을 줬으면 같은 행을 `prepared`로 돌려
 * `now + retryAfterMs`에 다시 claim되게 하고, 아니면 terminal `failed`다.
 * 임대 만료는 간격 0으로 같은 규칙을 탄다.
 */
export function decideFailure(
  state: { attempts: number; maxAttempts: number },
  retryAfterMs: number | undefined,
  now: Date,
): FailureDisposition {
  if (retryAfterMs === undefined || state.attempts >= state.maxAttempts) return { retry: false };
  return { retry: true, scheduledFor: new Date(now.getTime() + retryAfterMs) };
}
