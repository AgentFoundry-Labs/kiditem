import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { AdStrategyAgentService } from '../../../application/service/ad-strategy-agent.service';
import { ListAdRunsQueryDto, RunAdStrategyBodyDto } from './dto/ad-strategy-agent';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

@Controller('ad-agent')
export class AdStrategyAgentController {
  constructor(private readonly adStrategyAgentService: AdStrategyAgentService) {}

  @Post('run')
  run(@Body() body: RunAdStrategyBodyDto, @CurrentOrganization() organizationId: string) {
    return this.adStrategyAgentService.run({ ...body, organizationId });
  }

  @Get('status/:taskId')
  getStatus(@Param('taskId') taskId: string, @CurrentOrganization() organizationId: string) {
    return this.adStrategyAgentService.getStatus(taskId, organizationId);
  }

  @Get('latest')
  getLatest(@CurrentOrganization() organizationId: string) {
    return this.adStrategyAgentService.getLatestRun(organizationId);
  }

  @Get('runs')
  getRuns(@CurrentOrganization() organizationId: string, @Query() query: ListAdRunsQueryDto) {
    return this.adStrategyAgentService.getRuns({ ...query, organizationId });
  }
}
