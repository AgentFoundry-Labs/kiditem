import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/agent-os-repository.port';
import {
  type AgentRunnerCancelBySourceInput,
  type AgentRunnerCancelBySourceResult,
  type AgentRunnerExecuteRequestInput,
  type AgentRunnerExecuteRequestResult,
  type AgentRunnerInput,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../port/in/agent-runner.port';
import type { AgentRunRequestStatus } from '../../domain/agent-os.types';
import { AgentOsCatalogError } from '../../domain/agent-os.errors';
import { AgentRunExecutor } from './agent-run-executor.service';

const CANCELLABLE_REQUEST_STATUSES: AgentRunRequestStatus[] = [
  'pending',
  'claimed',
  'requires_approval',
];

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
    if (!input.organizationId) {
      throw new AgentOsCatalogError(
        'organization_required',
        'AgentRunCoordinator requires organizationId.',
      );
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
    if (!input.organizationId) {
      throw new AgentOsCatalogError(
        'organization_required',
        'AgentRunCoordinator requires organizationId.',
      );
    }

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
    if (!input.organizationId) {
      throw new AgentOsCatalogError(
        'organization_required',
        'AgentRunCoordinator requires organizationId.',
      );
    }

    const requests = await this.repository.listRunRequests({
      organizationId: input.organizationId,
      source: input.sourceType ?? null,
      sourceResourceType: input.sourceResourceType,
      sourceResourceId: input.sourceResourceId,
      status: CANCELLABLE_REQUEST_STATUSES,
      limit: 100,
    });

    let cancelledRequests = 0;
    for (const request of requests) {
      await this.repository.markRequestStatus({
        organizationId: input.organizationId,
        requestId: request.id,
        status: 'cancelled',
        errorCode: 'user_cancelled',
        errorMessage: input.reason ?? 'User cancelled the request.',
      });
      cancelledRequests += 1;
    }

    return {
      ok: true,
      cancelledRequests,
      skippedRequests: 0,
    };
  }
}
