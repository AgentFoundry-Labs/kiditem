export const OPERATION_ATTEMPT_VERIFIER_PORT = Symbol(
  'OPERATION_ATTEMPT_VERIFIER_PORT',
);

export interface ActiveBrowserOperationAttemptContext {
  runId: string;
  organizationId: string;
  operationKey: string;
  input: Record<string, unknown>;
  requestedByUserId: string | null;
  startedAt: Date;
  leaseExpiresAt: Date;
  deadlineAt: Date;
}

export interface OperationAttemptVerifierPort {
  verifyActiveBrowserAttempt(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
  }): Promise<ActiveBrowserOperationAttemptContext>;
}
