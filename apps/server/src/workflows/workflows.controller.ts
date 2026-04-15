import { Controller, Get, Post, Put, Delete, Body, Query, Param } from '@nestjs/common';
import { WorkflowsService } from './services/workflows.service';
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
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  create(@Body() body: CreateWorkflowBodyDto, @CurrentCompany() companyId: string) {
    return this.workflowsService.create({ ...body, companyId } as any);
  }

  @Get()
  findAll(@CurrentCompany() companyId: string, @Query() query: ListWorkflowsQueryDto) {
    return this.workflowsService.findAll({ ...query, companyId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflowsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateWorkflowBodyDto) {
    return this.workflowsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workflowsService.remove(id);
  }

  @Post('batch-run')
  batchRun(@Body() body: BatchRunWorkflowBodyDto, @CurrentUser() user: AuthUser) {
    return this.workflowsService.batchRun(body.workflowIds, body.triggeredBy, body.context, resolveTriggeredByUserId(body.triggeredBy, user));
  }

  @Post(':id/run')
  triggerRun(@Param('id') id: string, @Body() body: RunWorkflowBodyDto, @CurrentUser() user: AuthUser) {
    return this.workflowsService.triggerRun(id, body.triggeredBy, body.context, resolveTriggeredByUserId(body.triggeredBy, user));
  }

  @Get(':id/runs')
  findRuns(@Param('id') id: string) {
    return this.workflowsService.findRuns(id);
  }
}

@Controller('workflow-runs')
export class WorkflowRunsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get(':runId')
  findRunDetail(@Param('runId') runId: string) {
    return this.workflowsService.findRunDetail(runId);
  }
}
