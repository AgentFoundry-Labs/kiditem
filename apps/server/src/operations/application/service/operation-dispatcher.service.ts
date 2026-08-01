import { Inject, Injectable } from '@nestjs/common';
import { OPERATION_HANDLER_REGISTRY_PORT } from '../port/in/operation-handler-registry.port';
import { OPERATION_REPOSITORY_PORT } from '../port/out/repository/operation.repository.port';
import type {
  OperationRunRecord,
  OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import type { OperationHandlerRegistryPort } from '../port/in/operation-handler-registry.port';

@Injectable()
export class OperationDispatcherService {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
  ) {}

  async dispatch(run: OperationRunRecord): Promise<void> {
    if (!run.attemptToken) {
      throw new Error('operation_attempt_token_missing');
    }

    try {
      const handler = this.registry.getHandler(run.operationKey);
      const result = await handler.execute({
        runId: run.id,
        organizationId: run.organizationId,
        operationKey: run.operationKey,
        triggerSource: run.triggerSource,
        input: run.input,
        requestedByUserId: run.requestedByUserId,
        scheduleId: run.scheduleId,
        parentRunId: run.parentRunId,
        attemptToken: run.attemptToken,
      });

      switch (result.kind) {
        case 'completed':
          await this.repository.transition({
            organizationId: run.organizationId,
            runId: run.id,
            expectedStatuses: ['running'],
            expectedAttemptToken: run.attemptToken,
            status: 'succeeded',
            result: result.result,
            progress: 1,
            finishedAt: new Date(),
            claimedBy: null,
            attemptToken: null,
            claimedAt: null,
            leaseExpiresAt: null,
          });
          return;
        case 'delegated':
          await this.repository.transition({
            organizationId: run.organizationId,
            runId: run.id,
            expectedStatuses: ['running'],
            expectedAttemptToken: run.attemptToken,
            status: 'running',
            nativeRunType: result.nativeRunType,
            nativeRunId: result.nativeRunId,
            claimedBy: null,
            attemptToken: null,
            claimedAt: null,
            leaseExpiresAt: null,
          });
          return;
        case 'waiting_runtime':
          await this.repository.transition({
            organizationId: run.organizationId,
            runId: run.id,
            expectedStatuses: ['running'],
            expectedAttemptToken: run.attemptToken,
            status: 'waiting_runtime',
            claimedBy: null,
            attemptToken: null,
            claimedAt: null,
            leaseExpiresAt: null,
          });
          return;
      }
    } catch (error) {
      await this.fail(run, error);
    }
  }

  private async fail(run: OperationRunRecord, _error: unknown): Promise<void> {
    const terminal = run.attempts >= run.maxAttempts;
    await this.repository.transition({
      organizationId: run.organizationId,
      runId: run.id,
      expectedStatuses: ['running'],
      expectedAttemptToken: run.attemptToken,
      status: terminal ? 'failed' : 'queued',
      errorCode: 'operation_execution_failed',
      errorMessage: 'Operation execution failed',
      finishedAt: terminal ? new Date() : null,
      claimedBy: null,
      attemptToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });
  }
}
