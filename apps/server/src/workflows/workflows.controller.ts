import { Controller, Get, Post, Put, Delete, Body, Query, Param } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import {
  CreateWorkflowBodyDto,
  ListWorkflowsQueryDto,
  UpdateWorkflowBodyDto,
  RunWorkflowBodyDto,
  BatchRunWorkflowBodyDto,
} from './dto';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  create(@Body() body: CreateWorkflowBodyDto) {
    return this.workflowsService.create(body as any);
  }

  @Get()
  findAll(@Query() query: ListWorkflowsQueryDto) {
    return this.workflowsService.findAll(query);
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
  batchRun(@Body() body: BatchRunWorkflowBodyDto) {
    return this.workflowsService.batchRun(body.workflowIds, body.triggeredBy, body.context);
  }

  @Post(':id/run')
  triggerRun(@Param('id') id: string, @Body() body: RunWorkflowBodyDto) {
    return this.workflowsService.triggerRun(id, body.triggeredBy, body.context);
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
