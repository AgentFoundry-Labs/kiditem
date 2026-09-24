export const REGISTRATION_EXECUTION_PROVIDER_OUTCOMES = [
  'not_attempted',
  'definitive_failure',
  'uncertain',
  'succeeded',
] as const;

export type RegistrationExecutionProviderOutcome =
  (typeof REGISTRATION_EXECUTION_PROVIDER_OUTCOMES)[number];

/** 실행 상태 중 "아직 살아 있는" 것들. 후보 종료·재시도를 막는 근거다. */
export const LIVE_REGISTRATION_EXECUTION_STATUSES = [
  'prepared',
  'executing',
  'reconciling',
  'succeeded',
] as const;

export type RegistrationExecutionOptionSnapshotRow = Readonly<{
  submissionPayloadJson: unknown;
}>;

/**
 * Count option identities retained by immutable target execution snapshots.
 *
 * A target snapshot carries the selected options under `product.options`.
 * Count an option once per execution, even when it repeats. Older external-registration
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
  const ids = Array.isArray(product?.options)
    ? product.options.flatMap((option) => {
      const optionRecord = record(option);
      return typeof optionRecord?.id === 'string' ? [optionRecord.id] : [];
    })
    : [];
  return [...new Set(ids)];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
