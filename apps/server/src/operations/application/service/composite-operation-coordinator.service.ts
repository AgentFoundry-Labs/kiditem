import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../port/in/operation-handler-registry.port';
import {
  OPERATION_REPOSITORY_PORT,
  type OperationRunRecord,
  type OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import { OperationLifecycleGateService } from './operation-lifecycle-gate.service';
import type { CompositeOperationCoordinatorPort } from '../port/in/composite-operation-coordinator.port';
import type { StartChildOperation } from '../../../common/operation-definition';

const MIN_COMPOSITE_CHILDREN = 2;
const MAX_COMPOSITE_CHILDREN = 20;

@Injectable()
export class CompositeOperationCoordinatorService
  implements CompositeOperationCoordinatorPort
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
    private readonly lifecycleGate: OperationLifecycleGateService,
  ) {}

  async waitForChild(input: {
    parent: OperationRunRecord;
    child: StartChildOperation;
  }): Promise<void> {
    this.lifecycleGate.assertAccepting();
    if (!input.parent.attemptToken) {
      throw new Error('operation_attempt_token_missing');
    }
    const attemptToken = input.parent.attemptToken;
    const definition = this.registry.getDefinition(input.child.operationKey);
    const childInput = this.registry.parseInput(
      input.child.operationKey,
      input.child.input,
    );
    this.lifecycleGate.assertAccepting();
    const signal = this.lifecycleGate.signal();
    signal.throwIfAborted();
    const child = await this.repository.createChildAndWaitForDependency({
      signal,
      parentOrganizationId: input.parent.organizationId,
      parentRunId: input.parent.id,
      expectedAttemptToken: attemptToken,
      child: {
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
      },
    });

    if (!child) {
      throw new Error('operation_attempt_fence_lost');
    }
  }

  async waitForChildren(input: {
    parent: OperationRunRecord;
    children: StartChildOperation[];
  }): Promise<void> {
    this.lifecycleGate.assertAccepting();
    assertMultiChildContract(input.children);
    if (!input.parent.attemptToken) {
      throw new Error('operation_attempt_token_missing');
    }
    const attemptToken = input.parent.attemptToken;
    const children = input.children.map((child) => {
      const definition = this.registry.getDefinition(child.operationKey);
      const childInput = this.registry.parseInput(child.operationKey, child.input);
      return {
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
        idempotencyKey: child.idempotencyKey,
        input: childInput,
        maxAttempts: definition.maxAttempts,
        scheduledFor: null,
      };
    });
    this.lifecycleGate.assertAccepting();
    const signal = this.lifecycleGate.signal();
    signal.throwIfAborted();
    const created = await this.repository.createChildrenAndWaitForDependencies({
      signal,
      parentOrganizationId: input.parent.organizationId,
      parentRunId: input.parent.id,
      expectedAttemptToken: attemptToken,
      children,
    });
    if (!created) throw new Error('operation_attempt_fence_lost');
  }

  listChildren(input: {
    organizationId: string;
    parentRunId: string;
  }): Promise<OperationRunRecord[]> {
    return this.repository.listChildRuns(input);
  }

  async resumeTerminalChildren(now: Date): Promise<void> {
    this.lifecycleGate.assertAccepting();
    const parents = await this.repository.listWaitingDependencyParents({ limit: 100 });
    for (const parent of parents) {
      this.lifecycleGate.assertAccepting();
      const children = await this.repository.listChildRuns({
        organizationId: parent.organizationId,
        parentRunId: parent.id,
      });
      if (children.length === 0 || children.some((child) => !isTerminal(child.status))) {
        continue;
      }

      const attentionChild = children
        .filter((child) => child.status === 'attention_required')
        .sort((left, right) => left.operationKey.localeCompare(right.operationKey))[0];

      this.lifecycleGate.assertAccepting();
      await this.repository.transition({
        signal: this.lifecycleGate.signal(),
        organizationId: parent.organizationId,
        runId: parent.id,
        expectedStatuses: ['waiting_dependency'],
        status: attentionChild ? 'attention_required' : 'queued',
        errorCode: attentionChild
          ? attentionChild.errorCode ?? 'child_attention_required'
          : null,
        errorMessage: attentionChild
          ? attentionChild.errorMessage
            ?? `Child operation ${attentionChild.operationKey} requires attention`
          : null,
        finishedAt: attentionChild ? now : null,
      });
    }
  }

  async cancelChildren(
    parent: OperationRunRecord,
    reason: string,
  ): Promise<OperationRunRecord | null> {
    this.lifecycleGate.assertAccepting();
    const signal = this.lifecycleGate.signal();
    signal.throwIfAborted();
    const explicitReason = reason === 'operator_cancelled' ? null : reason;
    const cancelled = await this.repository.cancelRunAndActiveChildren({
      signal,
      organizationId: parent.organizationId,
      parentRunId: parent.id,
      parentErrorCode: explicitReason ? 'cancelled_by_operator' : null,
      parentErrorMessage: explicitReason,
      childErrorCode: 'cancelled_by_operator',
      childErrorMessage: reason,
      finishedAt: new Date(),
    });
    if (!cancelled) return null;
    await Promise.all(cancelled.children.map(async (child) => {
      const handler = this.registry.getHandler(child.operationKey);
      await handler.cancel?.({
        runId: child.id,
        organizationId: child.organizationId,
        operationKey: child.operationKey,
        reason,
        requestedByUserId: parent.requestedByUserId,
      });
    }));
    return cancelled.parent;
  }
}

function assertMultiChildContract(children: StartChildOperation[]): void {
  if (
    children.length < MIN_COMPOSITE_CHILDREN
    || children.length > MAX_COMPOSITE_CHILDREN
  ) {
    throw new Error('operation_composite_children_invalid');
  }
  const operationKeys = new Set<string>();
  const idempotencyKeys = new Set<string>();
  for (const child of children) {
    if (
      !child.operationKey.trim()
      || !child.idempotencyKey.trim()
      || operationKeys.has(child.operationKey)
      || idempotencyKeys.has(child.idempotencyKey)
    ) {
      throw new Error('operation_composite_children_invalid');
    }
    operationKeys.add(child.operationKey);
    idempotencyKeys.add(child.idempotencyKey);
  }
}

function isTerminal(status: OperationRunRecord['status']): boolean {
  return status === 'succeeded'
    || status === 'failed'
    || status === 'cancelled'
    || status === 'skipped'
    || status === 'attention_required';
}
