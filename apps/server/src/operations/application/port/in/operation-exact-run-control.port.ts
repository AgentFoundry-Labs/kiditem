export const OPERATION_EXACT_RUN_CONTROL_PORT = Symbol(
  'OPERATION_EXACT_RUN_CONTROL_PORT',
);

export interface OperationExactRunControlPort {
  fenceAndCancel(input: {
    signal: AbortSignal;
    organizationId: string;
    runs: ReadonlyArray<{
      runId: string;
      operationKey: string;
      expectedAttemptToken: string | null;
    }>;
    reason: string;
  }): Promise<ReadonlyArray<{
    runId: string;
    state: 'terminal' | 'fenced' | 'unknown';
    nativeRunType: string | null;
    nativeRunId: string | null;
  }>>;
}
