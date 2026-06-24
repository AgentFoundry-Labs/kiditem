import { Injectable } from '@nestjs/common';
import type { AgentOsLiveReadinessResponse } from '@kiditem/shared/agent-os';
import { ReadinessService } from '../../../../readiness/readiness.service';
import type { AgentOsLiveReadinessPort } from '../../../application/port/out/cross-domain/agent-os-live-readiness.port';

@Injectable()
export class AgentOsLiveReadinessAdapter implements AgentOsLiveReadinessPort {
  constructor(private readonly readinessService: ReadinessService) {}

  getAgentOsLiveStatus(
    organizationId: string,
  ): Promise<AgentOsLiveReadinessResponse> {
    return this.readinessService.getAgentOsLiveStatus(organizationId);
  }
}
