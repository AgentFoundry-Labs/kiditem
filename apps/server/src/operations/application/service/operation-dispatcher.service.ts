import { Inject, Injectable } from '@nestjs/common';
import { OPERATION_HANDLER_REGISTRY_PORT } from '../port/in/operation-handler-registry.port';
import { OPERATION_REPOSITORY_PORT } from '../port/out/repository/operation.repository.port';
import {
  COMPOSITE_OPERATION_COORDINATOR_PORT,
  type CompositeOperationCoordinatorPort,
} from '../port/in/composite-operation-coordinator.port';
import type {
  OperationRunRecord,
  OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import type { OperationHandlerRegistryPort } from '../port/in/operation-handler-registry.port';

export interface OperationDispatchControls {
  signal: AbortSignal;
  checkpoint(update?: {
    stage?: string;
    progressCurrent?: number;
    progressTotal?: number;
  }): Promise<void>;
  enterEphemeralFinalization(): Promise<{ signal: AbortSignal }>;
}

@Injectable()
export class OperationDispatcherService {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
    @Inject(COMPOSITE_OPERATION_COORDINATOR_PORT)
    private readonly compositeCoordinator: CompositeOperationCoordinatorPort,
  ) {}

  async dispatch(
    run: OperationRunRecord,
    controls: OperationDispatchControls,
  ): Promise<void> {
    if (!run.attemptToken) {
      throw new Error('operation_attempt_token_missing');
    }
    const attemptToken = run.attemptToken;

    try {
      controls.signal.throwIfAborted();
      const definition = this.registry.getDefinition(run.operationKey);
      if (
        definition.successPersistence === 'ephemeral_on_success' &&
        (
          run.triggerSource !== 'system' ||
          run.parentRunId !== null ||
          run.scheduleId !== null
        )
      ) {
        throw new Error('operation_ephemeral_dispatch_invalid');
      }
      const handler = this.registry.getHandler(run.operationKey);
      const context = {
        runId: run.id,
        organizationId: run.organizationId,
        operationKey: run.operationKey,
        triggerSource: run.triggerSource,
        input: run.input,
        requestedByUserId: run.requestedByUserId,
        scheduleId: run.scheduleId,
        parentRunId: run.parentRunId,
        attemptToken,
        signal: controls.signal,
        attempts: run.attempts,
        maxAttempts: run.maxAttempts,
        checkpoint: controls.checkpoint,
        enterEphemeralFinalization: controls.enterEphemeralFinalization,
      };
      const result = await handler.execute(context);
      controls.signal.throwIfAborted();
      await controls.checkpoint();
      controls.signal.throwIfAborted();

      switch (result.kind) {
        case 'completed':
          controls.signal.throwIfAborted();
          if (definition.successPersistence === 'ephemeral_on_success') {
            if (!handler.finalizeEphemeralSuccess) {
              throw new Error('operation_ephemeral_finalizer_missing');
            }
            const finalization = await controls.enterEphemeralFinalization();
            while (!finalization.signal.aborted) {
              try {
                await handler.finalizeEphemeralSuccess(context, result.result);
                return;
              } catch {
                if (finalization.signal.aborted) return;
                await controls.checkpoint({ stage: 'ephemeral_finalizing' });
                try {
                  await abortableDelay(250, finalization.signal);
                } catch {
                  return;
                }
              }
            }
            return;
          }
          await this.repository.transitionActiveAttempt({
            organizationId: run.organizationId,
            runId: run.id,
            expectedStatuses: ['running'],
            expectedAttemptToken: attemptToken,
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
        case 'retryable':
          controls.signal.throwIfAborted();
          if (run.attempts >= run.maxAttempts) {
            if (!handler.exhaustRetry) {
              throw new Error('operation_retry_exhaustion_handler_missing');
            }
            if (definition.successPersistence === 'ephemeral_on_success') {
              const finalization = await controls.enterEphemeralFinalization();
              while (!finalization.signal.aborted) {
                try {
                  await handler.exhaustRetry(context, {
                    code: result.code,
                    message: result.message,
                  });
                  return;
                } catch {
                  if (finalization.signal.aborted || controls.signal.aborted) return;
                  try {
                    await controls.checkpoint({
                      stage: 'ephemeral_exhaustion_finalizing',
                    });
                  } catch {
                    return;
                  }
                  if (finalization.signal.aborted || controls.signal.aborted) return;
                  try {
                    await abortableDelay(250, finalization.signal);
                  } catch {
                    return;
                  }
                }
              }
              return;
            }
            await handler.exhaustRetry(context, {
              code: result.code,
              message: result.message,
            });
            return;
          }
          await this.repository.requeueActiveAttemptAfter({
            organizationId: run.organizationId,
            runId: run.id,
            expectedAttemptToken: attemptToken,
            delayMs: result.retryAfterMs,
            errorCode: result.code,
            errorMessage: result.message,
          });
          return;
        case 'delegated':
          controls.signal.throwIfAborted();
          await this.repository.transitionActiveAttempt({
            organizationId: run.organizationId,
            runId: run.id,
            expectedStatuses: ['running'],
            expectedAttemptToken: attemptToken,
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
          controls.signal.throwIfAborted();
          await this.repository.transitionActiveAttempt({
            organizationId: run.organizationId,
            runId: run.id,
            expectedStatuses: ['running'],
            expectedAttemptToken: attemptToken,
            status: 'waiting_runtime',
            claimedBy: null,
            attemptToken: null,
            claimedAt: null,
            leaseExpiresAt: null,
          });
          return;
        case 'waiting_dependency':
          controls.signal.throwIfAborted();
          await this.compositeCoordinator.waitForChild({
            parent: run,
            child: result.child,
          });
          return;
        case 'waiting_dependencies':
          controls.signal.throwIfAborted();
          await this.compositeCoordinator.waitForChildren({
            parent: run,
            children: result.children,
          });
          return;
        case 'attention_required':
          controls.signal.throwIfAborted();
          await this.repository.transitionActiveAttempt({
            organizationId: run.organizationId,
            runId: run.id,
            expectedStatuses: ['running'],
            expectedAttemptToken: attemptToken,
            status: 'attention_required',
            result: result.result,
            errorCode: 'operation_attention_required',
            errorMessage: result.reason,
            finishedAt: new Date(),
            claimedBy: null,
            attemptToken: null,
            claimedAt: null,
            leaseExpiresAt: null,
          });
          return;
        case 'cancelled':
          await this.repository.transition({
            organizationId: run.organizationId,
            runId: run.id,
            expectedStatuses: ['running'],
            expectedAttemptToken: run.attemptToken,
            status: 'cancelled',
            result: result.result,
            finishedAt: new Date(),
            claimedBy: null,
            attemptToken: null,
            claimedAt: null,
            leaseExpiresAt: null,
          });
          return;
        case 'failed':
          controls.signal.throwIfAborted();
          await this.repository.transitionActiveAttempt({
            organizationId: run.organizationId,
            runId: run.id,
            expectedStatuses: ['running'],
            expectedAttemptToken: attemptToken,
            status: 'failed',
            errorCode: result.code,
            errorMessage: result.message,
            finishedAt: new Date(),
            claimedBy: null,
            attemptToken: null,
            claimedAt: null,
            leaseExpiresAt: null,
          });
          return;
      }
    } catch (error) {
      if (controls.signal.aborted) return;
      try {
        await controls.checkpoint();
      } catch {
        if (controls.signal.aborted) return;
      }
      if (controls.signal.aborted) return;
      await this.fail(run, attemptToken, error);
    }
  }

  private async fail(
    run: OperationRunRecord,
    attemptToken: string,
    _error: unknown,
  ): Promise<void> {
    const terminal = run.attempts >= run.maxAttempts;
    await this.repository.transitionActiveAttempt({
      organizationId: run.organizationId,
      runId: run.id,
      expectedStatuses: ['running'],
      expectedAttemptToken: attemptToken,
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

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    timeout.unref?.();
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
