import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/runtime/agent-runtime-handler.port';
import { AgentRuntimeHandlerRegistry } from '../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentToolRouter } from '../../../../agent-os/application/service/agent-tool-router.service';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import { SourcingPlaywrightRuntimeHandler } from './sourcing-playwright-runtime.handler';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

@Injectable()
export class SourcingRuntimeHandler implements AgentTypeRuntimeHandler, OnModuleInit {
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly toolRouter: AgentToolRouter,
    private readonly playwright: SourcingPlaywrightRuntimeHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register('sourcing', this);
  }

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    const action = stringField(context.input.action);
    if (action === 'scrape_url') {
      return this.playwright.execute(context);
    }
    if (action === 'market_opportunity_discovery') {
      return this.executeMarketOpportunityDiscovery(context);
    }
    throw new AgentOsRuntimeError(
      'sourcing_unknown_action',
      `Unknown sourcing action: ${action ?? '(missing)'}`,
    );
  }

  private async executeMarketOpportunityDiscovery(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const keyword = stringField(context.input.keyword) ?? '실리콘 식판';
    const category = stringField(context.input.category);
    const conversationId = stringField(context.input.conversationId);
    const common = {
      organizationId: context.organizationId,
      conversationId,
      agentInstanceId: context.agentInstanceId,
      agentType: context.agentType,
      requestId: context.requestId,
      runId: context.runId,
      input: { keyword, category, mode: 'stub' },
    };

    const market = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'market.collect_keyword_category_rankings',
    });
    const coupang = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'coupang.match_products',
    });
    const tracking = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'coupang.collect_tracking_snapshot',
    });
    const supplier = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'supplier1688.match_products',
    });
    const score = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'sourcing.score_opportunities',
    });
    const recommendation = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'sourcing.create_recommendation_packet',
    });

    return {
      provider: 'kiditem-sourcing-stub',
      output: {
        action: 'market_opportunity_discovery',
        keyword,
        category: category ?? null,
        toolInvocationIds: [
          market.invocation.id,
          coupang.invocation.id,
          tracking.invocation.id,
          supplier.invocation.id,
          score.invocation.id,
          recommendation.invocation.id,
        ],
        artifactIds: recommendation.artifacts.map((artifact) => artifact.id),
        status: 'awaiting_selection',
      },
    };
  }
}
