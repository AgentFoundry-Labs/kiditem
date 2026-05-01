import { Injectable } from '@nestjs/common';
import { AgentRegistryService } from '../../../../agent-registry/agent-registry.service';
import type {
  SourcingAgentGatewayPort,
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
}
