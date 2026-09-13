export type SourceAttemptState = 'RUNNING' | 'COMPLETE' | 'FAILED';
export type SourceReadinessStatus = 'ready' | 'stale' | 'missing';

export const SOURCE_READINESS_LABELS = {
  ready: '최신',
  stale: '갱신 필요',
  missing: '미수집',
} as const satisfies Record<SourceReadinessStatus, string>;

export type SourceReadinessDerivationInput<
  TAttempt extends Readonly<{ state: SourceAttemptState }> = Readonly<{ state: SourceAttemptState }>,
  TComplete extends Readonly<{ actualCutoff: string | null }> = Readonly<{
    actualCutoff: string | null;
  }>,
> = Readonly<{
  latestAttempt: TAttempt | null;
  latestComplete: TComplete | null;
  requiredCutoff: string;
}>;

export type SourceReadinessDerivation<
  TAttempt extends Readonly<{ state: SourceAttemptState }> = Readonly<{ state: SourceAttemptState }>,
  TComplete extends Readonly<{ actualCutoff: string | null }> = Readonly<{
    actualCutoff: string | null;
  }>,
> = Readonly<{
  ready: boolean;
  requiredCutoff: string;
  actualCutoff: string | null;
  latestAttempt: TAttempt | null;
  latestComplete: TComplete | null;
}>;

/** A newer attempt never changes the validity of the latest completed snapshot. */
export function deriveSourceReadiness<
  TAttempt extends Readonly<{ state: SourceAttemptState }>,
  TComplete extends Readonly<{ actualCutoff: string | null }>,
>(
  input: SourceReadinessDerivationInput<TAttempt, TComplete>,
): SourceReadinessDerivation<TAttempt, TComplete> {
  const actualCutoff = validCalendarDate(input.latestComplete?.actualCutoff)
    ? input.latestComplete.actualCutoff
    : null;

  return {
    ready: actualCutoff !== null
      && validCalendarDate(input.requiredCutoff)
      && actualCutoff >= input.requiredCutoff,
    requiredCutoff: input.requiredCutoff,
    actualCutoff,
    latestAttempt: input.latestAttempt,
    latestComplete: input.latestComplete,
  };
}

export function sourceReadinessStatus(
  source: Readonly<{
    ready: boolean;
    latestComplete: Readonly<{ actualCutoff: string | null }> | null;
  }>,
): SourceReadinessStatus {
  if (source.ready) return 'ready';
  return validCalendarDate(source.latestComplete?.actualCutoff) ? 'stale' : 'missing';
}

function validCalendarDate(value: string | null | undefined): value is string {
  if (value === null || value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
