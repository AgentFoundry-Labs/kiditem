import { Injectable } from '@nestjs/common';
import { AgentRegistryService } from '../../../../agent-registry/agent-registry.service';
import type {
  SourcingAgentGatewayPort,
  SourcingDetailPageGenerateRequest,
  SourcingDetailPageGenerateResult,
  SourcingScrapeRequest,
  SourcingScrapeResult,
} from '../../../application/port/out/sourcing-agent.gateway.port';

@Injectable()
export class SourcingAgentGatewayAdapter implements SourcingAgentGatewayPort {
  constructor(private readonly agentRegistry: AgentRegistryService) {}

  async scrapeUrl(request: SourcingScrapeRequest): Promise<SourcingScrapeResult> {
    const result = await this.agentRegistry.runByType('sourcing', {
      organizationId: request.organizationId,
      extra: {
        action: 'scrape_url',
        url: request.url,
        organization_id: request.organizationId,
      },
    });
    return { taskId: result.taskId };
  }

  async generateDetailPage(
    request: SourcingDetailPageGenerateRequest,
  ): Promise<SourcingDetailPageGenerateResult> {
    const result = await this.agentRegistry.runByType('content', {
      organizationId: request.organizationId,
      extra: {
        productId: request.productId,
        product_id: request.productId,
        generation_mode: request.mode,
        template_id: request.templateId,
        ...(request.seed_hook_text && { seed_hook_text: request.seed_hook_text }),
        ...(request.seed_hook_title_sub && { seed_hook_title_sub: request.seed_hook_title_sub }),
        ...(request.seed_hero_image && { seed_hero_image: request.seed_hero_image }),
      },
    });
    return { taskId: result.taskId };
  }
}
