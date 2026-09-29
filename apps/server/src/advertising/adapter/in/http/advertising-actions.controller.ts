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
        return this.adActionService.approveActions(body.ids ?? [], organizationId, {
          expectedApprovalStatus: body.expectedApprovalStatus,
        });
      case 'reject':
        return this.adActionService.rejectActions(body.ids ?? [], organizationId, {
          expectedApprovalStatus: body.expectedApprovalStatus,
        });
      default:
        throw new BadRequestException(`Unknown action: ${body.action}`);
    }
  }
}
