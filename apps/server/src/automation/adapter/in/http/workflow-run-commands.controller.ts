import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { WorkflowOrchestrationService } from '../../../application/service/workflow-orchestration.service';
import {
  BatchRunWorkflowBodyDto,
  RunWorkflowBodyDto,
} from './dto/workflows';

function resolveTriggeredByUserId(
  triggeredBy: string | undefined,
  user: AuthUser,
): string | undefined {
  return triggeredBy === 'manual' ? user.id : undefined;
}

@Controller('workflows')
export class WorkflowRunCommandsController {
  constructor(private readonly workflowsService: WorkflowOrchestrationService) {}

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
}
