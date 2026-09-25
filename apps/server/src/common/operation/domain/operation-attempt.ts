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
