import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BrowserOperationClaim,
  BrowserOperationHeartbeatRequest,
  BrowserOperationReportRequest,
} from '@kiditem/shared/operations';
import { OPERATION_HANDLER_REGISTRY_PORT } from '../port/in/operation-handler-registry.port';
import { OPERATION_REPOSITORY_PORT } from '../port/out/repository/operation.repository.port';
import type { OperationHandlerRegistryPort } from '../port/in/operation-handler-registry.port';
import type {
  OperationRunRecord,
  OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import { resolveOperationRunLeaseMs } from './operation-runtime.config';

@Injectable()
export class BrowserOperationRuntimeService {
  private readonly leaseMs = resolveOperationRunLeaseMs();

  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
  ) {}

  async claim(input: {
    organizationId: string;
    runtimeId: string;
    environmentId: 'local' | 'office';
  }): Promise<BrowserOperationClaim | null> {
    const now = new Date();
    const run = await this.repository.claimNextBrowserRun({
      organizationId: input.organizationId,
      runtimeId: `${input.environmentId}:${input.runtimeId}`,
      now,
      leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
    });
    if (!run) return null;

    const definition = this.registry.getDefinition(run.operationKey);
    if (definition.engineType !== 'browser') {
      throw new BadRequestException('browser_operation_not_allowed');
    }
    if (!run.attemptToken || !run.leaseExpiresAt || !run.deadlineAt) {
      throw new ConflictException('browser_runtime_fence_lost');
    }
    return {
      runId: run.id,
      operationKey: run.operationKey,
      attemptToken: run.attemptToken,
      attempt: run.attempts,
      input: run.input,
      leaseExpiresAt: run.leaseExpiresAt.toISOString(),
      deadlineAt: run.deadlineAt.toISOString(),
    } satisfies BrowserOperationClaim;
  }

  async heartbeat(input: {
    organizationId: string;
    runId: string;
    request: BrowserOperationHeartbeatRequest;
  }): Promise<void> {
    const now = new Date();
    const result = await this.repository.heartbeatBrowserRun({
      organizationId: input.organizationId,
      runId: input.runId,
      attemptToken: input.request.attemptToken,
      now,
      leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
      progress: input.request.progress,
      stage: input.request.stage,
      progressCurrent: input.request.progressCurrent,
      progressTotal: input.request.progressTotal,
    });
    if (!result) throw new ConflictException('browser_runtime_fence_lost');
  }

  async report(input: {
    organizationId: string;
    runId: string;
    attemptToken: string;
    status: BrowserOperationReportRequest['status'];
    progress?: number | null;
    stage?: BrowserOperationReportRequest['stage'];
    progressCurrent?: number | null;
    progressTotal?: number | null;
    result?: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
    attentionReason?: string;
  }): Promise<void> {
    const run = await this.reportTransition(input);
    if (!run) throw new ConflictException('browser_runtime_fence_lost');
  }

  async retry(input: { organizationId: string; runId: string }): Promise<void> {
    const current = await this.repository.findRunById({
      organizationId: input.organizationId,
      runId: input.runId,
    });
    if (!current) throw new NotFoundException('operation_run_not_found');
    if (current.engineType !== 'browser' || current.status !== 'attention_required') {
      throw new BadRequestException('browser_operation_not_retryable');
    }
    const attemptDelta = current.attempts >= current.maxAttempts
      ? current.maxAttempts - 1 - current.attempts
      : undefined;
    const resumed = await this.repository.transition({
      organizationId: input.organizationId,
      runId: input.runId,
      expectedStatuses: ['attention_required'],
      status: 'waiting_runtime',
      ...(attemptDelta === undefined ? {} : { attemptDelta }),
      errorCode: null,
      errorMessage: null,
      claimedBy: null,
      attemptToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });
    if (!resumed) throw new ConflictException('browser_runtime_fence_lost');
  }

  private reportTransition(input: {
    organizationId: string;
    runId: string;
    attemptToken: string;
    status: BrowserOperationReportRequest['status'];
    progress?: number | null;
    stage?: BrowserOperationReportRequest['stage'];
    progressCurrent?: number | null;
    progressTotal?: number | null;
    result?: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
    attentionReason?: string;
  }): Promise<OperationRunRecord | null> {
    const now = new Date();
    const base = {
      organizationId: input.organizationId,
      runId: input.runId,
      expectedStatuses: ['running'] as const,
      expectedAttemptToken: input.attemptToken,
      progress: input.progress,
      stage: input.stage,
      progressCurrent: input.progressCurrent,
      progressTotal: input.progressTotal,
    };

    switch (input.status) {
      case 'running':
        return this.repository.heartbeatBrowserRun({
          organizationId: input.organizationId,
          runId: input.runId,
          attemptToken: input.attemptToken,
          now,
          leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
          progress: input.progress,
          stage: input.stage,
          progressCurrent: input.progressCurrent,
          progressTotal: input.progressTotal,
        });
      case 'attention_required':
        return this.repository.transitionActiveAttempt({
          ...base,
          status: 'attention_required',
          errorCode: 'browser_attention_required',
          errorMessage: input.attentionReason ?? 'browser_attention_required',
          claimedBy: null,
          attemptToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
        });
      case 'succeeded':
        return this.repository.transitionActiveAttempt({
          ...base,
          status: 'succeeded',
          progress: 1,
          result: input.result ?? {},
          finishedAt: now,
          claimedBy: null,
          attemptToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
        });
      case 'failed':
        return this.repository.transitionActiveAttempt({
          ...base,
          status: 'failed',
          errorCode: input.errorCode ?? 'browser_operation_failed',
          errorMessage: input.errorMessage ?? 'Browser operation failed',
          finishedAt: now,
          claimedBy: null,
          attemptToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
        });
    }
  }
}
