import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../../../../agent-os/application/port/in/agent-runner.port';
import {
  POST_PROMOTION_AI_TRIGGER_PORT,
  type PostPromotionAiTriggerPort,
} from '../../../../ai/application/port/in/generation/post-promotion-ai-trigger.port';
import {
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
  type ProductGenerationAiTriggerPort,
} from '../../../../ai/application/port/in/generation/product-generation-ai-trigger.port';
import {
  SOURCING_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../../../application/port/out/cross-domain/operation-alert.port';
import type {
  SourcingAgentGatewayPort,
  SourcingNotifyPromotedRequest,
  SourcingScrapeRequest,
  SourcingScrapeResult,
  SourcingStartProductGenerationRequest,
  SourcingStartProductGenerationResult,
} from '../../../application/port/out/runtime/sourcing-agent.gateway.port';

@Injectable()
export class SourcingAgentGatewayAdapter implements SourcingAgentGatewayPort {
  private readonly logger = new Logger(SourcingAgentGatewayAdapter.name);

  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    @Inject(POST_PROMOTION_AI_TRIGGER_PORT)
    private readonly postPromotionAi: PostPromotionAiTriggerPort,
    @Inject(PRODUCT_GENERATION_AI_TRIGGER_PORT)
    private readonly productGenerationAi: ProductGenerationAiTriggerPort,
    @Inject(SOURCING_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
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
      ...(request.triggeredByUserId
        ? { requestedByUserId: request.triggeredByUserId }
        : {}),
    });
    return {
      taskId: this.requireTaskId(result, 'sourcing.scrape_url'),
      requestId: result.requestId,
    };
  }

  async notifyPromoted(request: SourcingNotifyPromotedRequest): Promise<void> {
    try {
      await this.postPromotionAi.fireForMaster(request.masterId, request.organizationId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `notifyPromoted failed for master=${request.masterId}; raising alert.`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.operationAlerts.start({
        organizationId: request.organizationId,
        operationKey: `post-promotion-ai:${request.masterId}`,
        type: 'post_promotion_ai_failed',
        title: '승격 후 AI 처리 실패',
        sourceType: 'master_product',
        sourceId: request.masterId,
        actorUserId: null,
        href: `/products/${request.masterId}`,
        metadata: { error: errorMessage },
      });
    }
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
