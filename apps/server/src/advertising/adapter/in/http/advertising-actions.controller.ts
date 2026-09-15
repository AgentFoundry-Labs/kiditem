import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AdActionService } from '../../../application/service/ad-action.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { AdActionCommandDto, AdActionQueryDto } from './dto';

@Controller('ads')
export class AdvertisingActionsController {
  constructor(private readonly adActionService: AdActionService) {}

  @Get('actions')
  getActions(@Query() query: AdActionQueryDto, @CurrentOrganization() organizationId: string) {
    return this.adActionService.getActions(query, organizationId);
  }

  @Post('actions')
  handleActionCommand(
    @Body() body: AdActionCommandDto,
    @CurrentOrganization() organizationId: string,
  ) {
    switch (body.action) {
      case 'generate':
        return this.adActionService.generateActions(organizationId);
      case 'approve':
        return this.adActionService.approveActions(body.ids ?? [], organizationId);
      case 'reject':
        return this.adActionService.rejectActions(body.ids ?? [], organizationId);
      case 'markRunning': {
        const { id, executionTaskId } = executionReportTarget(body);
        return this.adActionService.markRunning(id, executionTaskId, body.beforeJson, organizationId);
      }
      case 'markDone': {
        const { id, executionTaskId } = executionReportTarget(body);
        return this.adActionService.markDone(id, executionTaskId, body.afterJson, organizationId);
      }
      case 'markFailed': {
        const { id, executionTaskId } = executionReportTarget(body);
        return this.adActionService.markFailed(
          id,
          executionTaskId,
          body.errorMessage,
          body.afterJson,
          organizationId,
        );
      }
      default:
        throw new BadRequestException(`Unknown action: ${body.action}`);
    }
  }
}

/** An execution report names the action and the attempt it reports for (KID-160). */
function executionReportTarget(body: AdActionCommandDto): { id: string; executionTaskId: string } {
  if (!body.id || !body.executionTaskId) {
    throw new BadRequestException(`id and executionTaskId are required for ${body.action}`);
  }
  return { id: body.id, executionTaskId: body.executionTaskId };
}
