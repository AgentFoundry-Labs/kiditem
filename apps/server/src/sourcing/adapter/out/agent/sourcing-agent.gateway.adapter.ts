import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../../../../agent-os/application/port/in/agent-runner.port';
import type {
  SourcingAgentGatewayPort,
  SourcingDetailPageGenerateRequest,
  SourcingDetailPageGenerateResult,
  SourcingScrapeRequest,
  SourcingScrapeResult,
} from '../../../application/port/out/sourcing-agent.gateway.port';

/**
 * Outgoing adapter that binds {@link SourcingAgentGatewayPort} to Agent OS v2's
 * {@link AgentRunnerPort}. The legacy `AgentRegistryService.runByType()` hop is
 * replaced; the port-level result shape (`{ taskId }`) is preserved so callers
 * (`SourcingService.scrapeUrl`) keep their existing contract.
 *
 * `AgentRunnerResult.runId` is the primary identifier returned to consumers as
 * `taskId`. We fall back to `requestId` only when the runner produced a
 * durable request without an immediate run (e.g. `requires_approval`). If
 * neither is present, we surface the runner's `reason` rather than silently
 * fabricating a task id (no silent fallback rule).
 */
@Injectable()
export class SourcingAgentGatewayAdapter implements SourcingAgentGatewayPort {
  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
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

  async generateDetailPage(
    request: SourcingDetailPageGenerateRequest,
  ): Promise<SourcingDetailPageGenerateResult> {
    const result = await this.agentRunner.runByType('content', {
      organizationId: request.organizationId,
      sourceType: 'sourcing.generate_detail_page',
      sourceResourceType: 'master_product',
      sourceResourceId: request.productId,
      reason: 'sourcing detail-page generate',
      payload: {
        productId: request.productId,
        product_id: request.productId,
        generation_mode: request.mode,
        template_id: request.templateId,
        ...(request.seed_hook_text && { seed_hook_text: request.seed_hook_text }),
        ...(request.seed_hook_title_sub && { seed_hook_title_sub: request.seed_hook_title_sub }),
        ...(request.seed_hero_image && { seed_hero_image: request.seed_hero_image }),
      },
    });
    return { taskId: this.requireTaskId(result, 'sourcing.generate_detail_page') };
  }

  /**
   * Map AgentRunnerResult onto the legacy `taskId` contract.
   * Prefer `runId` (live `AgentRun.id`); fall back to `requestId`
   * (`AgentRunRequest.id`) only when the runner deferred execution.
   * Refuses to invent a task id — surfaces the runner's `reason` instead.
   */
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
