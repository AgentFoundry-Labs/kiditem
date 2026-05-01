import { Controller, Get, Post, Put, Delete, Body, Query, Param } from '@nestjs/common';
import { WorkflowOrchestrationService } from '../../../application/service/workflow-orchestration.service';
import {
  CreateWorkflowBodyDto,
  ListWorkflowsQueryDto,
  UpdateWorkflowBodyDto,
  RunWorkflowBodyDto,
  BatchRunWorkflowBodyDto,
} from './dto/workflows';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

function resolveTriggeredByUserId(triggeredBy: string | undefined, user: AuthUser): string | undefined {
  return triggeredBy === 'manual' ? user.id : undefined;
}

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowOrchestrationService) {}

  @Post()
  create(@Body() body: CreateWorkflowBodyDto, @CurrentOrganization() organizationId: string) {
    return this.workflowsService.create(body, organizationId);
  }

  @Get()
  findAll(@CurrentOrganization() organizationId: string, @Query() query: ListWorkflowsQueryDto) {
    return this.workflowsService.findAll(organizationId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.workflowsService.findOne(id, organizationId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: UpdateWorkflowBodyDto,
  ) {
    return this.workflowsService.update(id, organizationId, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.workflowsService.remove(id, organizationId);
  }

  @Post('batch-run')
  batchRun(
    @Body() body: BatchRunWorkflowBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workflowsService.batchRun(body.workflowIds, organizationId, {
      triggeredBy: body.triggeredBy,
      context: body.context,
      triggeredByUserId: resolveTriggeredByUserId(body.triggeredBy, user),
    });
  }

  @Post(':id/run')
  triggerRun(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: RunWorkflowBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workflowsService.triggerRun(id, organizationId, {
      triggeredBy: body.triggeredBy,
      context: body.context,
      triggeredByUserId: resolveTriggeredByUserId(body.triggeredBy, user),
    });
  }

  @Get(':id/runs')
  findRuns(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.workflowsService.findRuns(id, organizationId);
  }
}

@Controller('workflow-runs')
export class WorkflowRunsController {
  constructor(private readonly workflowsService: WorkflowOrchestrationService) {}

  @Get(':runId')
  findRunDetail(@Param('runId') runId: string, @CurrentOrganization() organizationId: string) {
    return this.workflowsService.findRunDetail(runId, organizationId);
  }
}
