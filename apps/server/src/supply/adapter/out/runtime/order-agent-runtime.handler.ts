import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/runtime/agent-runtime-handler.port';
import { AgentRuntimeHandlerRegistry } from '../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentToolRouter } from '../../../../agent-os/application/service/agent-tool-router.service';

@Injectable()
export class OrderAgentRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly toolRouter: AgentToolRouter,
  ) {}

  onModuleInit(): void {
    this.registry.register('order', this);
  }

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    const result = await this.toolRouter.invoke({
      organizationId: context.organizationId,
      conversationId:
        typeof context.input.conversationId === 'string'
          ? context.input.conversationId
          : null,
      agentInstanceId: context.agentInstanceId,
      agentType: context.agentType,
      requestId: context.requestId,
      runId: context.runId,
      capabilityKey: 'supply.create_purchase_order_draft',
      input: context.input,
    });
    return {
      provider: 'kiditem-supply',
      output: {
        action: 'create_purchase_order_draft',
        artifactIds: result.artifacts.map((artifact) => artifact.id),
      },
    };
  }
}
