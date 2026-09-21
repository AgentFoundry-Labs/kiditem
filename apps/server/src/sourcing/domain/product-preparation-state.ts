export const PRODUCT_PREPARATION_PROVIDER_OUTCOMES = [
  'not_attempted',
  'definitive_failure',
  'uncertain',
  'succeeded',
] as const;

export type ProductPreparationProviderOutcome =
  (typeof PRODUCT_PREPARATION_PROVIDER_OUTCOMES)[number];

interface ProviderOutcomeRow {
  providerOutcome: string | null;
  status: string;
  submissionKey: string | null;
  providerSubmissionId: string | null;
  registrationResult: unknown | null;
}

export function resolveProviderOutcome(
  row: ProviderOutcomeRow,
): ProductPreparationProviderOutcome {
  if (isProviderOutcome(row.providerOutcome)) return row.providerOutcome;
  if (row.providerOutcome !== null) return 'uncertain';
  if (row.registrationResult !== null || row.providerSubmissionId !== null) {
    return 'succeeded';
  }
  if (row.submissionKey !== null || row.status === 'submitting' || row.status === 'failed') {
    return 'uncertain';
  }
  return 'not_attempted';
}

/**
 * 새 제공자 생성을 시작해도 되는 결과인가.
 *
 * 초안 밖으로 나가지 않는다 — 등록 실행의 리스·재시도 판정은 Channels 울타리
 * (`channels/domain/registration-execution-state.ts`)가 소유한다(ADR-0014). 같은 규칙을
 * 두 도메인이 각자 내보내면 어느 쪽이 진실인지 매번 판정해야 한다.
 */
function canStartProviderCreate(
  outcome: ProductPreparationProviderOutcome,
): boolean {
  return outcome === 'not_attempted' || outcome === 'definitive_failure';
}

export function canDiscardProviderIdentity(input: {
  outcome: ProductPreparationProviderOutcome;
  providerSubmissionId: string | null;
  registrationResult: unknown | null;
}): boolean {
  return canStartProviderCreate(input.outcome)
    && input.providerSubmissionId === null
    && input.registrationResult === null;
}

export function blocksCandidateTerminalTransition(input: {
  status: string;
  outcome: ProductPreparationProviderOutcome;
  submissionKey: string | null;
  providerSubmissionId: string | null;
  registrationResult: unknown | null;
}): boolean {
  if (input.status === 'draft' || input.status === 'submitting') return true;
  if (input.status !== 'failed') return false;
  return input.outcome === 'uncertain'
    || input.outcome === 'succeeded'
    || input.providerSubmissionId !== null
    || input.registrationResult !== null;
}

function isProviderOutcome(value: string | null): value is ProductPreparationProviderOutcome {
  return PRODUCT_PREPARATION_PROVIDER_OUTCOMES.some((outcome) => outcome === value);
}
