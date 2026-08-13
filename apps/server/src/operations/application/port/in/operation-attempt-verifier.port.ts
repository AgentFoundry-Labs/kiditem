import type { ActiveBrowserAttemptTransaction } from '../active-browser-attempt-transaction';

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
  withActiveBrowserAttemptFence<T>(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
  }, operation: (
    attempt: ActiveBrowserOperationAttemptContext,
    transaction: ActiveBrowserAttemptTransaction,
  ) => Promise<T>): Promise<T>;
  verifyActiveBrowserAttempt(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
  }): Promise<ActiveBrowserOperationAttemptContext>;
}
