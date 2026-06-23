import { Inject, Injectable } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import { findAgentDefinitionByType } from '../../domain/agent-definition.registry';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../port/in/agent-runner.port';

@Injectable()
export class AgentTaskDelegationService {
  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly runner: AgentRunnerPort,
  ) {}

  async delegate(input: {
    organizationId: string;
    parentAgentType: string;
    agentType: string;
    conversationId: string;
    parentRequestId: string;
    delegatedByRunId?: string | null;
    requestedByUserId?: string | null;
    requestedByActorType?: string | null;
    requestedByActorId?: string | null;
    sourceType?: string;
    sourceResourceType?: string;
    sourceResourceId?: string;
    taskKey?: string;
    playbookKey: string;
    planStepKey: string;
    displayName: string;
    idempotencyKey?: string | null;
    payload: Record<string, unknown>;
  }): Promise<AgentRunnerResult> {
    const parentDefinition = findAgentDefinitionByType(input.parentAgentType);
    if (parentDefinition?.delegationRole !== 'orchestrator') {
      throw new AgentOsRuntimeError(
        'agent_delegation_not_allowed',
        `${input.parentAgentType} cannot delegate to ${input.agentType}.`,
      );
    }

    return this.runner.runByType(input.agentType, {
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey ?? undefined,
      requestedByUserId: input.requestedByUserId ?? undefined,
      requestedByActorType: input.requestedByActorType ?? 'agent',
      requestedByActorId:
        input.requestedByActorId ??
        input.delegatedByRunId ??
        input.parentRequestId,
      taskKey:
        input.taskKey ??
        `conversation:${input.conversationId}:${input.planStepKey}`,
      sourceType: input.sourceType ?? 'agent_os_delegation',
      sourceResourceType: input.sourceResourceType ?? 'agent_conversation',
      sourceResourceId: input.sourceResourceId ?? input.conversationId,
      conversationId: input.conversationId,
      parentRequestId: input.parentRequestId,
      delegatedByRunId: input.delegatedByRunId ?? null,
      playbookKey: input.playbookKey,
      planStepKey: input.planStepKey,
      displayName: input.displayName,
      payload: input.payload,
    });
  }
}
