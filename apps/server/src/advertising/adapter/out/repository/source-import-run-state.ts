export type SourceImportRunDbState = 'running' | 'completed' | 'failed';
export type SourceImportRunState = 'RUNNING' | 'COMPLETE' | 'FAILED';

export type SourceImportRunStateFact = Readonly<{
  status: string;
  expiresAt: Date | null;
}>;

/** Unknown persisted values fail closed until the source-state migration repairs them. */
export function sourceImportRunDbState(status: string): SourceImportRunDbState {
  if (status === 'running' || status === 'completed' || status === 'failed') {
    return status;
  }
  return 'failed';
}

export function effectiveSourceImportRunState(
  attempt: SourceImportRunStateFact,
  now: Date,
): SourceImportRunState {
  const persisted = sourceImportRunDbState(attempt.status);
  if (persisted === 'completed') return 'COMPLETE';
  if (persisted === 'running' && (!attempt.expiresAt || attempt.expiresAt > now)) {
    return 'RUNNING';
  }
  return 'FAILED';
}
