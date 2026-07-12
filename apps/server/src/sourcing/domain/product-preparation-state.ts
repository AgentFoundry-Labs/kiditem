export const PRODUCT_PREPARATION_PROVIDER_OUTCOMES = [
  'not_attempted',
  'definitive_failure',
  'uncertain',
  'succeeded',
] as const;

export type ProductPreparationProviderOutcome =
  (typeof PRODUCT_PREPARATION_PROVIDER_OUTCOMES)[number];

export const PRODUCT_PREPARATION_SUBMISSION_LEASE_MS = 5 * 60 * 1_000;

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

export function canStartProviderCreate(
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

export function hasLiveSubmissionLease(input: {
  token: string | null;
  claimedAt: Date | null;
  now: Date;
}): boolean {
  return input.token !== null
    && input.claimedAt !== null
    && input.claimedAt.getTime()
      > input.now.getTime() - PRODUCT_PREPARATION_SUBMISSION_LEASE_MS;
}

function isProviderOutcome(value: string | null): value is ProductPreparationProviderOutcome {
  return PRODUCT_PREPARATION_PROVIDER_OUTCOMES.some((outcome) => outcome === value);
}
