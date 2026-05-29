import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../application/port/out/runtime/agent-runtime-handler.port';
import { AgentRuntimeHandlerRegistry } from '../../../application/service/agent-runtime-handler-registry.service';
import { AgentTaskDelegationService } from '../../../application/service/agent-task-delegation.service';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

@Injectable()
export class OperatorRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly delegation: AgentTaskDelegationService,
  ) {}

  onModuleInit(): void {
    this.registry.register('manager', this);
  }

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    const conversationId = stringField(context.input.conversationId);
    if (!conversationId) {
      return {
        provider: 'kiditem-operator',
        output: { status: 'blocked', reason: 'conversation_id_required' },
      };
    }

    const keyword = stringField(context.input.keyword) ?? '실리콘 식판';
    const category = stringField(context.input.category);
    const delegated = await this.delegation.delegate({
      organizationId: context.organizationId,
      agentType: 'sourcing',
      conversationId,
      parentRequestId: context.requestId,
      delegatedByRunId: context.runId,
      requestedByUserId: stringField(context.input.requestedByUserId),
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      planStepKey: 'sourcing_agent',
      displayName: 'Sourcing Agent',
      payload: {
        action: 'market_opportunity_discovery',
        conversationId,
        keyword,
        category,
      },
    });

    return {
      provider: 'kiditem-operator',
      output: {
        status: 'delegated',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        delegatedRequestId: delegated.requestId ?? null,
      },
    };
  }
}
