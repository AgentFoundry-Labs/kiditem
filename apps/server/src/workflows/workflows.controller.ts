import { Controller, Get, Post, Put, Delete, Body, Query, Param, BadRequestException } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  create(@Body() body: Record<string, any>) {
    if (!body.name || !body.companyId || !body.nodesJson || !body.edgesJson) {
      throw new BadRequestException('name, companyId, nodesJson, edgesJson are required');
    }
    return this.workflowsService.create(body as any);
  }

  @Get()
  findAll(@Query() query: { companyId?: string; module?: string; isActive?: string }) {
    return this.workflowsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflowsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.workflowsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workflowsService.remove(id);
  }

  @Post('batch-run')
  batchRun(@Body() body: { workflowIds: string[]; triggeredBy?: string; context?: Record<string, any> }) {
    if (!body.workflowIds?.length) {
      throw new BadRequestException('workflowIds is required');
    }
    return this.workflowsService.batchRun(body.workflowIds, body.triggeredBy, body.context);
  }

  @Post(':id/run')
  triggerRun(@Param('id') id: string, @Body() body: { triggeredBy?: string; context?: Record<string, any> }) {
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
