export const REGISTRATION_EXECUTION_PROVIDER_OUTCOMES = [
  'not_attempted',
  'definitive_failure',
  'uncertain',
  'succeeded',
] as const;

export type RegistrationExecutionProviderOutcome =
  (typeof REGISTRATION_EXECUTION_PROVIDER_OUTCOMES)[number];

/** 살아 있는 실행 리스의 수명. 이 시간이 지나면 다른 시도가 이어받을 수 있다. */
export const REGISTRATION_EXECUTION_LEASE_MS = 5 * 60 * 1_000;

/** 실행 상태 중 "아직 살아 있는" 것들. 후보 종료·재시도를 막는 근거다. */
export const LIVE_REGISTRATION_EXECUTION_STATUSES = [
  'prepared',
  'executing',
  'reconciling',
  'succeeded',
] as const;

export function hasLiveExecutionLease(input: {
  token: string | null;
  claimedAt: Date | null;
  now: Date;
}): boolean {
  return input.token !== null
    && input.claimedAt !== null
    && input.claimedAt.getTime()
      > input.now.getTime() - REGISTRATION_EXECUTION_LEASE_MS;
}

/**
 * 공급자 식별자가 하나라도 남아 있으면 그 실행은 "제출된 적 없음"으로 되돌릴 수 없다.
 * 기록된 성공을 실패로 뒤집는 경로는 없어야 한다.
 */
export function retainsProviderIdentity(input: {
  providerSubmissionId: string | null;
  externalListingId: string | null;
  resultJson: unknown;
}): boolean {
  return input.providerSubmissionId !== null
    || input.externalListingId !== null
    || input.resultJson !== null;
}
