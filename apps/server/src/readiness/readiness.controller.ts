import { Controller, Get } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
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

  @Get('rebuild')
  getRebuild(
    @CurrentOrganization() organizationId: string,
  ): Promise<RebuildReadinessResponse> {
    return this.service.getRebuildStatus(organizationId);
  }

  /** Authenticated, bounded CLI admission canary; no credential material is returned. */
  @Get('agent-runtime')
  getAgentRuntime(): Promise<Array<{ agentDefinitionKey: string; runtimeType: string; model: string }>> {
    return this.service.getAgentAttemptRuntimeReadiness();
  }
}
