import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../application/port/in/agent-runner.port';
import { AgentObservabilityService } from '../../../application/service/agent-observability.service';
import type { AgentRunRequestStatus } from '../../../domain/agent-os.types';
import {
  CreateAgentRunRequestDto,
  ListRunRequestsQueryDto,
} from './dto/agent-runs.dto';

@Controller('agent-os')
export class AgentRunRequestsController {
  private readonly logger = new Logger(AgentRunRequestsController.name);

  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly runner: AgentRunnerPort,
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
    this.kickImmediateHttpRequest({
      organizationId,
      requestId: result.requestId,
      scheduledFor: body.scheduledFor,
      dryRun: body.dryRun,
    });
    return result;
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

  private kickImmediateHttpRequest(input: {
    organizationId: string;
    requestId?: string;
    scheduledFor?: string;
    dryRun?: boolean;
  }): void {
    if (!input.requestId || input.scheduledFor || input.dryRun) return;
    if (!this.runner.executeRequest) return;

    void this.runner
      .executeRequest({
        organizationId: input.organizationId,
        requestId: input.requestId,
        workerId: 'agent-os-http',
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to kick Agent OS request ${input.requestId}: ${error}`,
        );
      });
  }
}
