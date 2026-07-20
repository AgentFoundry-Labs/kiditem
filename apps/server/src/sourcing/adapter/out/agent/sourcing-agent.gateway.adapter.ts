import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../../../../agent-os/application/port/in/agent-runner.port';
import {
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
  type ProductGenerationAiTriggerPort,
} from '../../../../ai/application/port/in/generation/product-generation-ai-trigger.port';
import type {
  SourcingAgentGatewayPort,
  SourcingScrapeRequest,
  SourcingScrapeResult,
  SourcingStartProductGenerationRequest,
  SourcingStartProductGenerationResult,
} from '../../../application/port/out/runtime/sourcing-agent.gateway.port';

@Injectable()
export class SourcingAgentGatewayAdapter implements SourcingAgentGatewayPort {
  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    @Inject(PRODUCT_GENERATION_AI_TRIGGER_PORT)
    private readonly productGenerationAi: ProductGenerationAiTriggerPort,
  ) {}

  async scrapeUrl(request: SourcingScrapeRequest): Promise<SourcingScrapeResult> {
    const result = await this.agentRunner.runByType('sourcing', {
      organizationId: request.organizationId,
      sourceType: 'sourcing.scrape_url',
      reason: 'sourcing scrape-url',
      payload: {
        action: 'scrape_url',
        url: request.url,
        organization_id: request.organizationId,
      },
      ...(request.conversationId
        ? { conversationId: request.conversationId }
        : {}),
      ...(request.parentRequestId
        ? { parentRequestId: request.parentRequestId }
        : {}),
      ...(request.delegatedByRunId
        ? { delegatedByRunId: request.delegatedByRunId }
        : {}),
      ...(request.triggeredByUserId
        ? { requestedByUserId: request.triggeredByUserId }
        : {}),
    });
    return {
      taskId: this.requireTaskId(result, 'sourcing.scrape_url'),
      requestId: result.requestId,
    };
  }

  startProductGeneration(
    request: SourcingStartProductGenerationRequest,
  ): Promise<SourcingStartProductGenerationResult> {
    return this.productGenerationAi.startForCandidate(request);
  }

  private requireTaskId(result: AgentRunnerResult, sourceType: string): string {
    const taskId = result.runId ?? result.requestId;
    if (!taskId) {
      throw new InternalServerErrorException(
        `Agent OS runner returned no runId/requestId for ${sourceType}` +
          (result.reason ? ` (${result.reason})` : ''),
      );
    }
    return taskId;
  }
}
