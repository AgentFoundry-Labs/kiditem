import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { AgentObservabilityService } from '../../../application/service/agent-observability.service';
import type { AgentRunStatus } from '../../../domain/agent-os.types';
import { ListRunsQueryDto } from './dto/agent-runs.dto';

@Controller('agent-os')
export class AgentRunsQueryController {
  constructor(private readonly observability: AgentObservabilityService) {}

  @Get('runs')
  async listRuns(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListRunsQueryDto,
  ) {
    const items = await this.observability.listRuns({
      organizationId,
      agentInstanceId: query.agentInstanceId ?? null,
      status: query.status ? (query.status.split(',') as AgentRunStatus[]) : null,
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
    return { items };
  }

  @Get('runs/:id')
  async getRun(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ) {
    const run = await this.observability.findRun({
      organizationId,
      runId: id,
    });
    if (!run) {
      throw new NotFoundException('Agent run not found');
    }
    return run;
  }
}
