import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { AgentRunCoordinator } from '../../../application/service/agent-run-coordinator.service';
import { AgentRunExecutor } from '../../../application/service/agent-run-executor.service';
import { AgentObservabilityService } from '../../../application/service/agent-observability.service';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../application/port/in/agent-runner.port';
import {
  ClaimAndRunDto,
  CreateAgentRunRequestDto,
  ListAuthorizationEventsQueryDto,
  ListCostEventsQueryDto,
  ListRunEventsQueryDto,
  ListRunRequestsQueryDto,
  ListRunsQueryDto,
} from './dto/agent-runs.dto';
import type {
  AgentAuthorizationDecision,
  AgentRunRequestStatus,
  AgentRunStatus,
} from '../../../domain/agent-os.types';

@Controller('agent-os')
export class AgentRunsController {
  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly runner: AgentRunnerPort,
    private readonly coordinator: AgentRunCoordinator,
    private readonly executor: AgentRunExecutor,
    private readonly observability: AgentObservabilityService,
  ) {}

  @Post('runs')
  async createRunRequest(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateAgentRunRequestDto,
  ) {
    const result = await this.runner.runByType(body.agentType, {
      organizationId,
      requestedByUserId: user.id,
      taskKey: body.taskKey,
      idempotencyKey: body.idempotencyKey,
      priority: body.priority,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      sourceWorkflowRunId: body.sourceWorkflowRunId,
      sourceWorkflowNodeId: body.sourceWorkflowNodeId,
      sourceResourceType: body.sourceResourceType,
      sourceResourceId: body.sourceResourceId,
      reason: body.reason,
      triggerDetail: body.triggerDetail,
      payload: body.payload,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined,
      dryRun: body.dryRun,
    });
    return result;
  }

  @Post('executor/claim-and-run')
  async claimAndRun(
    @CurrentOrganization() _organizationId: string,
    @Body() body: ClaimAndRunDto,
  ) {
    return this.executor.executeNext(body.workerId);
  }

  @Get('requests')
  async listRequests(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListRunRequestsQueryDto,
  ) {
    const items = await this.observability.listRequests({
      organizationId,
      agentInstanceId: query.agentInstanceId ?? null,
      status: query.status
        ? (query.status.split(',') as AgentRunRequestStatus[])
        : null,
      source: query.source ?? null,
      sourceWorkflowRunId: query.sourceWorkflowRunId ?? null,
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
    return { items };
  }

  @Get('requests/:id')
  async getRequest(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ) {
    const request = await this.observability.findRequest({
      organizationId,
      requestId: id,
    });
    if (!request) {
      throw new NotFoundException('Agent run request not found');
    }
    return request;
  }

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
