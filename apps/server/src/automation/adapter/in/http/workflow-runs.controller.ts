import { Controller, Get, Param } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { WorkflowOrchestrationService } from '../../../application/service/workflow-orchestration.service';

@Controller('workflows')
export class WorkflowRunsController {
  constructor(private readonly workflowsService: WorkflowOrchestrationService) {}

  @Get(':id/runs')
  findRuns(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.workflowsService.findRuns(id, organizationId);
  }
}

@Controller('workflow-runs')
export class WorkflowRunDetailsController {
  constructor(private readonly workflowsService: WorkflowOrchestrationService) {}

  @Get(':runId')
  findRunDetail(@Param('runId') runId: string, @CurrentOrganization() organizationId: string) {
    return this.workflowsService.findRunDetail(runId, organizationId);
  }
}
