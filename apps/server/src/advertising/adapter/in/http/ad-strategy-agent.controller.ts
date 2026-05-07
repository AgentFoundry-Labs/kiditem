import { Body, Controller, Post } from '@nestjs/common';
import { AdStrategyAgentService } from '../../../application/service/ad-strategy-agent.service';
import { RunAdStrategyBodyDto } from './dto/ad-strategy-agent';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

/**
 * Manual trigger for the `ad_strategy` agent. Run observability
 * (status / latest / list) is served by the Agent OS surface
 * (`/api/agent-os/runs*`).
 */
@Controller('ad-agent')
export class AdStrategyAgentController {
  constructor(private readonly adStrategyAgentService: AdStrategyAgentService) {}

  @Post('run')
  run(@Body() body: RunAdStrategyBodyDto, @CurrentOrganization() organizationId: string) {
    return this.adStrategyAgentService.run({ ...body, organizationId });
  }
}
