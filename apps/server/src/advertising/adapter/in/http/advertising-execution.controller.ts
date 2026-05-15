import { Body, Controller, Post } from '@nestjs/common';
import { AdExecutionService } from '../../../application/service/ad-execution.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { HeartbeatDto, LeaseDto, ReportDto } from './dto';

@Controller('ads')
export class AdvertisingExecutionController {
  constructor(private readonly adExecutionService: AdExecutionService) {}

  @Post('execution/lease')
  executionLease(@Body() body: LeaseDto, @CurrentOrganization() organizationId: string) {
    return this.adExecutionService.lease(
      body.workerKey,
      {
        label: body.label,
        pageType: body.pageType,
        limit: body.limit,
      },
      organizationId,
    );
  }

  @Post('execution/heartbeat')
  executionHeartbeat(@Body() body: HeartbeatDto, @CurrentOrganization() organizationId: string) {
    return this.adExecutionService.heartbeat(
      body.workerKey,
      {
        currentUrl: body.currentUrl,
        currentPageType: body.currentPageType,
      },
      organizationId,
    );
  }

  @Post('execution/report')
  executionReport(@Body() body: ReportDto, @CurrentOrganization() organizationId: string) {
    return this.adExecutionService.report(body, organizationId);
  }
}
