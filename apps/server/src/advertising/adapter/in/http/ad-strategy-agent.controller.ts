import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { AdStrategyAgentService } from '../../../application/service/ad-strategy-agent.service';
import { ListAdRunsQueryDto, RunAdStrategyBodyDto } from './dto/ad-strategy-agent';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';

@Controller('ad-agent')
export class AdStrategyAgentController {
  constructor(private readonly adStrategyAgentService: AdStrategyAgentService) {}

  @Post('run')
  run(@Body() body: RunAdStrategyBodyDto, @CurrentCompany() companyId: string) {
    return this.adStrategyAgentService.run({ ...body, companyId });
  }

  @Get('status/:taskId')
  getStatus(@Param('taskId') taskId: string) {
    return this.adStrategyAgentService.getStatus(taskId);
  }

  @Get('latest')
  getLatest(@CurrentCompany() companyId: string) {
    return this.adStrategyAgentService.getLatestRun(companyId);
  }

  @Get('runs')
  getRuns(@CurrentCompany() companyId: string, @Query() query: ListAdRunsQueryDto) {
    return this.adStrategyAgentService.getRuns({ ...query, companyId });
  }
}
