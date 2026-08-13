import { Inject, Injectable } from '@nestjs/common';
import type { StartChildOperation } from '../../../common/operation-definition';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../port/in/operation-handler-registry.port';
import type { CompositeOperationCoordinatorPort } from '../port/in/composite-operation-coordinator.port';
import {
  OPERATION_REPOSITORY_PORT,
  type OperationRunRecord,
  type OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';

const CANCELLABLE_CHILD_STATUSES = [
  'queued',
  'waiting_runtime',
  'waiting_dependency',
  'running',
  'attention_required',
] as const;

@Injectable()
export class CompositeOperationCoordinatorService
  implements CompositeOperationCoordinatorPort
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
  ) {}

  async waitForChild(input: {
    parent: OperationRunRecord;
    child: StartChildOperation;
  }): Promise<void> {
    if (!input.parent.attemptToken) {
      throw new Error('operation_attempt_token_missing');
    }
    const attemptToken = input.parent.attemptToken;
    const definition = this.registry.getDefinition(input.child.operationKey);
    const childInput = this.registry.parseInput(
      input.child.operationKey,
      input.child.input,
    );
    const existing = await this.repository.findByIdempotencyKey({
      organizationId: input.parent.organizationId,
      operationKey: input.child.operationKey,
      idempotencyKey: input.child.idempotencyKey,
    });

    if (!existing) {
      await this.repository.createRun({
        organizationId: input.parent.organizationId,
        operationKey: definition.key,
        definitionVersion: definition.version,
        ownerDomain: definition.ownerDomain,
        title: definition.title,
        engineType: definition.engineType,
        resourceClass: definition.resourceClass,
        executionTimeoutMs: definition.executionTimeoutMs,
        triggerSource: input.parent.triggerSource,
        requestedByUserId: input.parent.requestedByUserId,
        parentRunId: input.parent.id,
        scheduleId: null,
        idempotencyKey: input.child.idempotencyKey,
        input: childInput,
        maxAttempts: definition.maxAttempts,
        scheduledFor: null,
      });
    }

    await this.repository.transitionActiveAttempt({
      organizationId: input.parent.organizationId,
      runId: input.parent.id,
      expectedStatuses: ['running'],
      expectedAttemptToken: attemptToken,
      status: 'waiting_dependency',
      claimedBy: null,
      attemptToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });
  }

  listChildren(input: {
    organizationId: string;
    parentRunId: string;
  }): Promise<OperationRunRecord[]> {
    return this.repository.listChildRuns(input);
  }

  async resumeTerminalChildren(now: Date): Promise<void> {
    const parents = await this.repository.listWaitingDependencyParents({ limit: 100 });
    for (const parent of parents) {
      const child = (await this.repository.listChildRuns({
        organizationId: parent.organizationId,
        parentRunId: parent.id,
      }))[0];
      if (!child || !isTerminal(child.status)) continue;

      if (child.status === 'succeeded') {
        await this.repository.transition({
          organizationId: parent.organizationId,
          runId: parent.id,
          expectedStatuses: ['waiting_dependency'],
          status: 'queued',
          attemptDelta: -1,
          errorCode: null,
          errorMessage: null,
          finishedAt: null,
        });
        continue;
      }

      await this.repository.transition({
        organizationId: parent.organizationId,
        runId: parent.id,
        expectedStatuses: ['waiting_dependency'],
        status: child.status === 'attention_required'
          ? 'attention_required'
          : child.status === 'cancelled' || child.status === 'skipped'
            ? 'cancelled'
            : 'failed',
        errorCode: child.errorCode ?? `child_${child.status}`,
        errorMessage: child.errorMessage ?? `Child operation ${child.operationKey} ${child.status}`,
        finishedAt: now,
      });
    }
  }

  async cancelChildren(parent: OperationRunRecord, reason: string): Promise<void> {
    const children = await this.repository.listChildRuns({
      organizationId: parent.organizationId,
      parentRunId: parent.id,
    });
    await Promise.all(children
      .filter((child) => CANCELLABLE_CHILD_STATUSES.includes(child.status as typeof CANCELLABLE_CHILD_STATUSES[number]))
      .map(async (child) => {
        const handler = this.registry.getHandler(child.operationKey);
        await handler.cancel?.({
          runId: child.id,
          organizationId: child.organizationId,
          operationKey: child.operationKey,
          reason,
          requestedByUserId: parent.requestedByUserId,
        });
        await this.repository.transition({
          organizationId: child.organizationId,
          runId: child.id,
          expectedStatuses: CANCELLABLE_CHILD_STATUSES,
          status: 'cancelled',
          errorCode: 'cancelled_by_operator',
          errorMessage: reason,
          finishedAt: new Date(),
          claimedBy: null,
          attemptToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
        });
      }));
  }
}

function isTerminal(status: OperationRunRecord['status']): boolean {
  return status === 'succeeded'
    || status === 'failed'
    || status === 'cancelled'
    || status === 'skipped'
    || status === 'attention_required';
}
