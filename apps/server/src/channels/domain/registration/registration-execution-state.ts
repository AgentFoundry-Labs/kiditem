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

export type RegistrationExecutionFact = Readonly<{
  executionId: string;
  registrationTargetId: string;
  channelAccountId: string;
  channelListingId: string | null;
  executionKind: string;
  status: string;
  providerOutcome: string;
  providerSubmissionId: string | null;
  externalListingId: string | null;
  hasResult: boolean;
  reviewPayloadHash: string | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  createdAt: Date;
}>;

/** 수집후보 하나가 지금 어떤 등록 상태인지. 후보 행이 아니라 울타리가 근거다. */
export type CandidateRegistrationState =
  | 'none'
  | 'preparing'
  | 'confirming'
  | 'failed'
  | 'registered';

export type RegistrationExecutionOptionSnapshotRow = Readonly<{
  submissionPayloadJson: unknown;
}>;

/**
 * Count option identities retained by immutable target execution snapshots.
 *
 * A target snapshot carries the selected options under `product.options` and
 * repeats their identities under `supplyPrices`. Count an option once per
 * execution, even when both fields contain it. Older external-registration
 * payloads do not have a product snapshot and therefore contribute no option
 * reference.
 */
export function countFrozenSalesProductOptionReferences(
  rows: readonly RegistrationExecutionOptionSnapshotRow[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const optionIds = frozenSalesProductOptionIds(row.submissionPayloadJson);
    for (const optionId of optionIds) {
      counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
    }
  }
  return counts;
}

function frozenSalesProductOptionIds(value: unknown): readonly string[] {
  const payload = record(value);
  if (!payload) return [];
  const product = record(payload.product);
  const ids = [
    ...(Array.isArray(product?.options)
      ? product.options.flatMap((option) => {
        const optionRecord = record(option);
        return typeof optionRecord?.id === 'string' ? [optionRecord.id] : [];
      })
      : []),
    ...(Array.isArray(payload.supplyPrices)
      ? payload.supplyPrices.flatMap((price) => {
        const priceRecord = record(price);
        return typeof priceRecord?.salesProductOptionId === 'string'
          ? [priceRecord.salesProductOptionId]
          : [];
      })
      : []),
  ];
  return [...new Set(ids)];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * 울타리가 후보의 종료(거절·삭제)를 막는가.
 *
 * 살아 있는 실행이 하나라도 있거나, 끝난 실행에 공급자 식별자가 남아 있으면 막는다 —
 * 그 후보는 마켓에 무언가 올라갔을 수 있고, 후보를 지워도 그 사실은 사라지지 않는다.
 */
export function blocksCandidateTerminalTransition(
  facts: readonly RegistrationExecutionFact[],
): boolean {
  return facts.some((fact) =>
    (LIVE_REGISTRATION_EXECUTION_STATUSES as readonly string[]).includes(fact.status)
    || fact.providerSubmissionId !== null
    || fact.externalListingId !== null
    || fact.hasResult);
}

/**
 * 초안 하나의 등록 상태. 수집후보 화면이 "등록됨 / 확인중 / 실패"를 이 값으로 비춘다.
 *
 * `confirming` 은 제출 여부를 모르는 상태다(`reconciling`, 또는 시작됐지만 결과가
 * 아직 없는 `executing`). 그 구분이 사라지면 사람이 같은 상품을 한 번 더 올린다.
 */
export function candidateRegistrationState(
  facts: readonly RegistrationExecutionFact[],
): CandidateRegistrationState {
  if (facts.length === 0) return 'none';
  const [latest] = facts;
  if (!latest) return 'none';
  if (latest.status === 'succeeded') return 'registered';
  if (latest.status === 'reconciling') return 'confirming';
  if (latest.status === 'executing') {
    return latest.providerOutcome === 'succeeded' ? 'registered' : 'confirming';
  }
  if (latest.status === 'failed') return 'failed';
  if (latest.status === 'prepared') return 'preparing';
  return 'none';
}

/** Public draft view: only closure is stored on the draft, submission state is a ledger projection. */
export function registrationDraftState(
  closedAt: Date | null,
  execution?: Pick<RegistrationExecutionFact, 'status' | 'channelListingId'>,
): 'draft' | 'submitting' | 'failed' | 'registered' | 'cancelled' {
  if (execution?.status === 'succeeded') return 'registered';
  if (closedAt !== null || execution?.status === 'cancelled') return 'cancelled';
  if (execution?.status === 'failed') return 'failed';
  return execution ? 'submitting' : 'draft';
}
