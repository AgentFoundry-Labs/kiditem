import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  OPERATION_ATTEMPT_VERIFIER_PORT,
  type ActiveBrowserOperationAttemptContext,
  type OperationAttemptVerifierPort,
} from '../port/in/operation-attempt-verifier.port';
import {
  OPERATION_REPOSITORY_PORT,
  type ActiveBrowserOperationAttemptRecord,
  type OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import type { ActiveBrowserAttemptTransaction } from '../port/active-browser-attempt-transaction';
import { OperationLifecycleGateService } from './operation-lifecycle-gate.service';

const OPERATION_ATTEMPT_CLOCK = Symbol('OPERATION_ATTEMPT_CLOCK');

@Injectable()
export class OperationAttemptVerifierService
  implements OperationAttemptVerifierPort
{
  constructor(
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
    private readonly lifecycleGate: OperationLifecycleGateService,
    @Optional()
    @Inject(OPERATION_ATTEMPT_CLOCK)
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async withActiveBrowserAttemptFence<T>(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
  }, operation: (
    attempt: ActiveBrowserOperationAttemptContext,
    transaction: ActiveBrowserAttemptTransaction,
  ) => Promise<T>): Promise<T> {
    this.lifecycleGate.assertAccepting();
    const result = await this.repository.withActiveBrowserAttemptFence(
      input,
      async (attempt, transaction) => {
        this.lifecycleGate.assertAccepting();
        const value = await operation(toContext(attempt), transaction);
        this.lifecycleGate.assertAccepting();
        return value;
      },
    );
    if (result === null) {
      throw new ConflictException('browser_runtime_fence_lost');
    }
    return result;
  }

  async verifyActiveBrowserAttempt(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
  }): Promise<ActiveBrowserOperationAttemptContext> {
    this.lifecycleGate.assertAccepting();
    const now = this.clock();
    const attempt = await this.repository.findActiveBrowserAttempt({
      ...input,
      now,
    });
    this.lifecycleGate.assertAccepting();

    if (
      attempt === null
      || attempt.runId !== input.runId
      || attempt.organizationId !== input.organizationId
      || attempt.operationKey !== input.expectedOperationKey
      || attempt.engineType !== 'browser'
      || attempt.status !== 'running'
      || attempt.attemptToken !== input.attemptToken
      || attempt.leaseExpiresAt.getTime() <= now.getTime()
      || attempt.deadlineAt.getTime() <= now.getTime()
    ) {
      throw new ConflictException('browser_runtime_fence_lost');
    }

    return {
      runId: attempt.runId,
      organizationId: attempt.organizationId,
      operationKey: attempt.operationKey,
      input: attempt.input,
      requestedByUserId: attempt.requestedByUserId,
      startedAt: attempt.startedAt,
      leaseExpiresAt: attempt.leaseExpiresAt,
      deadlineAt: attempt.deadlineAt,
    };
  }
}

function toContext(
  attempt: ActiveBrowserOperationAttemptRecord,
): ActiveBrowserOperationAttemptContext {
  return {
    runId: attempt.runId,
    organizationId: attempt.organizationId,
    operationKey: attempt.operationKey,
    input: attempt.input,
    requestedByUserId: attempt.requestedByUserId,
    startedAt: attempt.startedAt,
    leaseExpiresAt: attempt.leaseExpiresAt,
    deadlineAt: attempt.deadlineAt,
  };
}

export const operationAttemptVerifierProvider = {
  provide: OPERATION_ATTEMPT_VERIFIER_PORT,
  useExisting: OperationAttemptVerifierService,
};
