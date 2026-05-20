import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';
import {
  type AgentRunnerCancelBySourceInput,
  type AgentRunnerCancelBySourceResult,
  type AgentRunnerCancelByWorkflowRunInput,
  type AgentRunnerCancelRequestInput,
  type AgentRunnerCancelResult,
  type AgentRunnerCancelRunInput,
  type AgentRunnerExecuteRequestInput,
  type AgentRunnerExecuteRequestResult,
  type AgentRunnerInput,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../port/in/agent-runner.port';
import type { AgentRunRequestStatus } from '../../domain/agent-os.types';
import { AgentOsCatalogError } from '../../domain/agent-os.errors';
import { AgentRunExecutor } from './agent-run-executor.service';
import { operationCancellationAudit } from '../../../common/operation-cancellation-audit';
import { findAgentDefinitionByType } from '../../domain/agent-definition.registry';

const CANCELLABLE_REQUEST_STATUSES: AgentRunRequestStatus[] = [
  'pending',
  'claimed',
  'requires_approval',
];

const CANCELLATION_MESSAGE = 'User cancelled the request.';

function isCancellableRequestStatus(status: AgentRunRequestStatus): boolean {
  return CANCELLABLE_REQUEST_STATUSES.includes(status);
}

function cancelReason(reason: string | undefined): string {
  return reason && reason.trim().length > 0 ? reason : CANCELLATION_MESSAGE;
}

@Injectable()
export class AgentRunCoordinator implements AgentRunnerPort {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Optional()
    private readonly executor?: AgentRunExecutor,
  ) {}

  async runByType(
    type: string,
    input: AgentRunnerInput,
  ): Promise<AgentRunnerResult> {
    this.assertOrganization(input.organizationId);
    if (!findAgentDefinitionByType(type)) {
      return {
        ok: false,
        agentType: type,
        reason: 'agent_definition_not_found',
      };
    }

    const agentInstance = await this.repository.findActiveInstanceByType({
      organizationId: input.organizationId,
      type,
    });

    if (!agentInstance) {
      return {
        ok: false,
        agentType: type,
        reason: 'agent_instance_not_found',
      };
    }

    if (agentInstance.lifecycleStatus !== 'active') {
      return {
        ok: false,
        agentType: type,
        agentInstanceId: agentInstance.id,
        status: agentInstance.lifecycleStatus,
        reason: `agent_instance_${agentInstance.lifecycleStatus}`,
      };
    }

    const taskKey = input.taskKey && input.taskKey.length > 0 ? input.taskKey : 'default';

    const taskSession = await this.repository.ensureTaskSession({
      organizationId: input.organizationId,
      agentInstanceId: agentInstance.id,
      adapterType: agentInstance.adapterType,
      taskKey,
    });

    if (input.idempotencyKey && input.idempotencyKey.length > 0) {
      const existing = await this.repository.findRunRequestByIdempotency({
        organizationId: input.organizationId,
        agentInstanceId: agentInstance.id,
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) {
        return {
          ok: true,
          requestId: existing.id,
          agentInstanceId: agentInstance.id,
          agentType: type,
          status: existing.status,
          reason: 'idempotency_hit',
        };
      }
    }

    if (input.dryRun) {
      return {
        ok: true,
        agentInstanceId: agentInstance.id,
        agentType: type,
        status: 'skipped',
        reason: 'dry_run',
      };
    }

    const request = await this.repository.createRunRequest({
      organizationId: input.organizationId,
      agentInstanceId: agentInstance.id,
      taskSessionId: taskSession.id,
      source: input.sourceType,
      triggerDetail: input.triggerDetail ?? null,
      reason: input.reason ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      priority: input.priority ?? 0,
      sourceWorkflowRunId: input.sourceWorkflowRunId ?? null,
      sourceWorkflowNodeId: input.sourceWorkflowNodeId ?? null,
      sourceResourceType: input.sourceResourceType ?? null,
      sourceResourceId: input.sourceResourceId ?? input.sourceId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      requestedByActorType: input.requestedByActorType ?? null,
      requestedByActorId: input.requestedByActorId ?? null,
      payload: input.payload ?? {},
      scheduledFor: input.scheduledFor ?? new Date(),
    });

    return {
      ok: true,
      requestId: request.id,
      agentInstanceId: agentInstance.id,
      agentType: type,
      status: request.status,
    };
  }

  async executeRequest(
    input: AgentRunnerExecuteRequestInput,
  ): Promise<AgentRunnerExecuteRequestResult> {
    this.assertOrganization(input.organizationId);

    if (!this.executor) {
      return {
        executed: false,
        requestId: input.requestId,
        reason: 'executor_not_configured',
      };
    }

    return this.executor.executeRequest(
      input.workerId ?? 'agent-runner-inline',
      input.organizationId,
      input.requestId,
    );
  }

  async cancelBySource(
    input: AgentRunnerCancelBySourceInput,
  ): Promise<AgentRunnerCancelBySourceResult> {
    this.assertOrganization(input.organizationId);

    const requests = await this.repository.listRunRequests({
      organizationId: input.organizationId,
      source: input.sourceType ?? null,
      sourceResourceType: input.sourceResourceType,
      sourceResourceId: input.sourceResourceId,
      status: CANCELLABLE_REQUEST_STATUSES,
      limit: 100,
    });

    let cancelledRequests = 0;
    let cancelledRuns = 0;
    for (const request of requests) {
      const result = await this.cancelRequest({
        organizationId: input.organizationId,
        requestId: request.id,
        reason: input.reason,
        actorUserId: input.actorUserId,
      });
      cancelledRequests += result.cancelledRequests;
      cancelledRuns += result.cancelledRuns;
    }

    return {
      ok: true,
      cancelledRequests,
      cancelledRuns,
      skippedRequests: 0,
      skippedRuns: 0,
    };
  }

  async cancelRequest(
    input: AgentRunnerCancelRequestInput,
  ): Promise<AgentRunnerCancelResult> {
    this.assertOrganization(input.organizationId);
    const request = await this.repository.findRunRequestById({
      organizationId: input.organizationId,
      requestId: input.requestId,
    });
    if (!request || !isCancellableRequestStatus(request.status)) {
      return this.cancelResult({
        skippedRequests: 1,
      });
    }

    const cancelledRequest = await this.repository.markRequestStatusIfCurrent({
      organizationId: input.organizationId,
      requestId: request.id,
      currentStatuses: CANCELLABLE_REQUEST_STATUSES,
      status: 'cancelled',
      errorCode: 'user_cancelled',
      errorMessage: cancelReason(input.reason),
      payload: {
        ...request.payload,
        operationCancellation: operationCancellationAudit({
          requestedByUserId: input.actorUserId ?? null,
          reason: cancelReason(input.reason),
          target: { targetType: 'agent_run_request', requestId: request.id },
          affected: { agentRunRequestIds: [request.id] },
          result: 'cancelled',
        }),
      },
    });
    if (!cancelledRequest) {
      return this.cancelResult({
        skippedRequests: 1,
      });
    }

    const runningRun = await this.repository.findRunByRequestId({
      organizationId: input.organizationId,
      requestId: request.id,
      status: ['running'],
    });
    if (runningRun) {
      await this.repository.appendRunEvent({
        organizationId: input.organizationId,
        runId: runningRun.id,
        agentInstanceId: runningRun.agentInstanceId,
        type: 'run.cancel_requested',
        message: cancelReason(input.reason),
        data: {
          requestId: request.id,
          reason: input.reason ? input.reason : null,
          operationCancellation: operationCancellationAudit({
            requestedByUserId: input.actorUserId ?? null,
            reason: cancelReason(input.reason),
            target: { targetType: 'agent_run_request', requestId: request.id },
            affected: {
              agentRunRequestIds: [request.id],
              agentRunIds: [runningRun.id],
            },
            result: 'cancelled',
          }),
        },
      });
      await this.repository.finalizeRun({
        organizationId: input.organizationId,
        runId: runningRun.id,
        requestId: request.id,
        status: 'cancelled',
        errorCode: 'user_cancelled',
        errorMessage: cancelReason(input.reason),
      });
    }

    return this.cancelResult({
      cancelledRequests: 1,
      cancelledRuns: runningRun ? 1 : 0,
    });
  }

  async cancelRun(
    input: AgentRunnerCancelRunInput,
  ): Promise<AgentRunnerCancelResult> {
    this.assertOrganization(input.organizationId);
    const run = await this.repository.findRunById({
      organizationId: input.organizationId,
      runId: input.runId,
    });
    if (!run || run.status !== 'running') {
      return this.cancelResult({ skippedRuns: 1 });
    }

    const request = await this.repository.findRunRequestById({
      organizationId: input.organizationId,
      requestId: run.requestId,
    });
    if (!request || !isCancellableRequestStatus(request.status)) {
      return this.cancelResult({ skippedRequests: 1, skippedRuns: 1 });
    }

    const cancelledRequest = await this.repository.markRequestStatusIfCurrent({
      organizationId: input.organizationId,
      requestId: request.id,
      currentStatuses: CANCELLABLE_REQUEST_STATUSES,
      status: 'cancelled',
      errorCode: 'user_cancelled',
      errorMessage: cancelReason(input.reason),
      payload: {
        ...request.payload,
        operationCancellation: operationCancellationAudit({
          requestedByUserId: input.actorUserId ?? null,
          reason: cancelReason(input.reason),
          target: { targetType: 'agent_run', runId: run.id },
          affected: {
            agentRunRequestIds: [request.id],
            agentRunIds: [run.id],
          },
          result: 'cancelled',
        }),
      },
    });
    if (!cancelledRequest) {
      return this.cancelResult({ skippedRequests: 1, skippedRuns: 1 });
    }

    await this.repository.appendRunEvent({
      organizationId: input.organizationId,
      runId: run.id,
      agentInstanceId: run.agentInstanceId,
      type: 'run.cancel_requested',
      message: cancelReason(input.reason),
      data: {
        requestId: run.requestId,
        reason: input.reason ? input.reason : null,
        operationCancellation: operationCancellationAudit({
          requestedByUserId: input.actorUserId ?? null,
          reason: cancelReason(input.reason),
          target: { targetType: 'agent_run', runId: run.id },
          affected: {
            agentRunIds: [run.id],
            agentRunRequestIds: [run.requestId],
          },
          result: 'cancelled',
        }),
      },
    });
    await this.repository.finalizeRun({
      organizationId: input.organizationId,
      runId: run.id,
      requestId: run.requestId,
      status: 'cancelled',
      errorCode: 'user_cancelled',
      errorMessage: cancelReason(input.reason),
    });

    return this.cancelResult({
      cancelledRequests: 1,
      cancelledRuns: 1,
    });
  }

  async cancelByWorkflowRun(
    input: AgentRunnerCancelByWorkflowRunInput,
  ): Promise<AgentRunnerCancelResult> {
    this.assertOrganization(input.organizationId);
    const requests = await this.repository.listRunRequests({
      organizationId: input.organizationId,
      sourceWorkflowRunId: input.workflowRunId,
      status: CANCELLABLE_REQUEST_STATUSES,
      limit: 100,
    });

    let cancelledRequests = 0;
    let cancelledRuns = 0;
    for (const request of requests) {
      const result = await this.cancelRequest({
        organizationId: input.organizationId,
        requestId: request.id,
        reason: input.reason,
        actorUserId: input.actorUserId,
      });
      cancelledRequests += result.cancelledRequests;
      cancelledRuns += result.cancelledRuns;
    }

    return this.cancelResult({ cancelledRequests, cancelledRuns });
  }

  private assertOrganization(organizationId: string): void {
    if (!organizationId) {
      throw new AgentOsCatalogError(
        'organization_required',
        'AgentRunCoordinator requires organizationId.',
      );
    }
  }

  private cancelResult(
    input: Partial<Omit<AgentRunnerCancelResult, 'ok'>>,
  ): AgentRunnerCancelResult {
    return {
      ok: true,
      cancelledRequests: input.cancelledRequests ?? 0,
      cancelledRuns: input.cancelledRuns ?? 0,
      skippedRequests: input.skippedRequests ?? 0,
      skippedRuns: input.skippedRuns ?? 0,
    };
  }
}
