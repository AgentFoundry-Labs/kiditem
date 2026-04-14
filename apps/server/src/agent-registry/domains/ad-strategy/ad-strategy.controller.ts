import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { AdStrategyService } from './ad-strategy.service';
import { RunAdStrategyBodyDto, ListAdRunsQueryDto } from './dto';
import { CurrentCompany } from '../../../auth/decorators/current-company.decorator';

@Controller('ad-agent')
export class AdStrategyController {
  constructor(private readonly adStrategyService: AdStrategyService) {}

  @Post('run')
  run(@Body() body: RunAdStrategyBodyDto) {
    return this.adStrategyService.run(body);
  }

  @Get('status/:taskId')
  getStatus(@Param('taskId') taskId: string) {
    return this.adStrategyService.getStatus(taskId);
  }

  @Get('latest')
  getLatest(@CurrentCompany() companyId: string) {
    return this.adStrategyService.getLatestRun(companyId);
  }

  @Get('runs')
  getRuns(@Query() query: ListAdRunsQueryDto) {
    return this.adStrategyService.getRuns(query as any);
  }
}
