import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { WorkflowOrchestrationService } from '../../../application/service/workflow-orchestration.service';
import {
  CreateWorkflowBodyDto,
  ListWorkflowsQueryDto,
  UpdateWorkflowBodyDto,
} from './dto/workflows';

@Controller('workflows')
export class WorkflowTemplatesController {
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
}
