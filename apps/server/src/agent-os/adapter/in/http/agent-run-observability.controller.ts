import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { AgentObservabilityService } from '../../../application/service/agent-observability.service';
import type { AgentAuthorizationDecision } from '../../../domain/agent-os.types';
import {
  ListAuthorizationEventsQueryDto,
  ListCostEventsQueryDto,
  ListRunEventsQueryDto,
} from './dto/agent-runs.dto';

@Controller('agent-os')
export class AgentRunObservabilityController {
  constructor(private readonly observability: AgentObservabilityService) {}

  @Get('runs/:id/events')
  async listRunEvents(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Query() query: ListRunEventsQueryDto,
  ) {
    const items = await this.observability.listRunEvents({
      organizationId,
      runId: id,
      cursorSeq: query.cursorSeq ?? null,
      limit: query.limit,
    });
    return { items };
  }

  @Get('cost-events')
  async listCostEvents(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListCostEventsQueryDto,
  ) {
    const result = await this.observability.listCostEvents({
      organizationId,
      agentInstanceId: query.agentInstanceId ?? null,
      provider: query.provider ?? null,
      model: query.model ?? null,
      fromOccurredAt: query.fromOccurredAt ? new Date(query.fromOccurredAt) : null,
      toOccurredAt: query.toOccurredAt ? new Date(query.toOccurredAt) : null,
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
    return {
      items: result.items.map((item) => ({
        ...item,
        costMicros: item.costMicros.toString(),
      })),
      totalCostMicros: result.totalCostMicros.toString(),
    };
  }

  @Get('authorization-events')
  async listAuthorizationEvents(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListAuthorizationEventsQueryDto,
  ) {
    const items = await this.observability.listAuthorizationEvents({
      organizationId,
      agentInstanceId: query.agentInstanceId ?? null,
      decision: query.decision
        ? (query.decision.split(',') as AgentAuthorizationDecision[])
        : null,
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
    return { items };
  }
}
