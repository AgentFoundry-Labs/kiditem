import { Inject, Injectable } from '@nestjs/common';
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

  delegate(input: {
    organizationId: string;
    agentType: string;
    conversationId: string;
    parentRequestId: string;
    delegatedByRunId?: string | null;
    requestedByUserId?: string | null;
    playbookKey: string;
    planStepKey: string;
    displayName: string;
    payload: Record<string, unknown>;
  }): Promise<AgentRunnerResult> {
    return this.runner.runByType(input.agentType, {
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId ?? undefined,
      requestedByActorType: 'agent',
      requestedByActorId: input.delegatedByRunId ?? input.parentRequestId,
      taskKey: `conversation:${input.conversationId}:${input.planStepKey}`,
      sourceType: 'agent_os_delegation',
      sourceResourceType: 'agent_conversation',
      sourceResourceId: input.conversationId,
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
