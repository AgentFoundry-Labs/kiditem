import { Controller, Get, Post, Put, Delete, Body, Query, Param } from '@nestjs/common';
import { WorkflowOrchestrationService } from '../automation/application/service/workflow-orchestration.service';
import {
  CreateWorkflowBodyDto,
  ListWorkflowsQueryDto,
  UpdateWorkflowBodyDto,
  RunWorkflowBodyDto,
  BatchRunWorkflowBodyDto,
} from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

function resolveTriggeredByUserId(triggeredBy: string | undefined, user: AuthUser): string | undefined {
  return triggeredBy === 'manual' ? user.id : undefined;
}

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowOrchestrationService) {}

  @Post()
  create(@Body() body: CreateWorkflowBodyDto, @CurrentCompany() companyId: string) {
    return this.workflowsService.create(body, companyId);
  }

  @Get()
  findAll(@CurrentCompany() companyId: string, @Query() query: ListWorkflowsQueryDto) {
    return this.workflowsService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.workflowsService.findOne(id, companyId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() body: UpdateWorkflowBodyDto,
  ) {
    return this.workflowsService.update(id, companyId, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.workflowsService.remove(id, companyId);
  }

  @Post('batch-run')
  batchRun(
    @Body() body: BatchRunWorkflowBodyDto,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workflowsService.batchRun(body.workflowIds, companyId, {
      triggeredBy: body.triggeredBy,
      context: body.context,
      triggeredByUserId: resolveTriggeredByUserId(body.triggeredBy, user),
    });
  }

  @Post(':id/run')
  triggerRun(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() body: RunWorkflowBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workflowsService.triggerRun(id, companyId, {
      triggeredBy: body.triggeredBy,
      context: body.context,
      triggeredByUserId: resolveTriggeredByUserId(body.triggeredBy, user),
    });
  }

  @Get(':id/runs')
  findRuns(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.workflowsService.findRuns(id, companyId);
  }
}

@Controller('workflow-runs')
export class WorkflowRunsController {
  constructor(private readonly workflowsService: WorkflowOrchestrationService) {}

  @Get(':runId')
  findRunDetail(@Param('runId') runId: string, @CurrentCompany() companyId: string) {
    return this.workflowsService.findRunDetail(runId, companyId);
  }
}
