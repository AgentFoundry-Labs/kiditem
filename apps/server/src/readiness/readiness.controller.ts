import { Controller, Get } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
import type { AgentOsLiveReadinessResponse } from '@kiditem/shared/agent-os';
import type {
  ReadinessResponse,
  RebuildReadinessResponse,
} from '@kiditem/shared/readiness';

@Controller('readiness')
export class ReadinessController {
  constructor(private readonly service: ReadinessService) {}

  @Get()
  get(@CurrentOrganization() organizationId: string): Promise<ReadinessResponse> {
    return this.service.getStatus(organizationId);
  }

  @Get('agent-os-live')
  getAgentOsLive(
    @CurrentOrganization() organizationId: string,
  ): Promise<AgentOsLiveReadinessResponse> {
    return this.service.getAgentOsLiveStatus(organizationId);
  }

  @Get('rebuild')
  getRebuild(
    @CurrentOrganization() organizationId: string,
  ): Promise<RebuildReadinessResponse> {
    return this.service.getRebuildStatus(organizationId);
  }
}
