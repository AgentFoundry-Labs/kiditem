import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/agent-os-repository.port';
import {
  type AgentRunnerInput,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../port/in/agent-runner.port';
import { AgentOsCatalogError } from '../../domain/agent-os.errors';

@Injectable()
export class AgentRunCoordinator implements AgentRunnerPort {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
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
}
