import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { AdStrategyService } from './ad-strategy.service';

@Controller('ad-agent')
export class AdStrategyController {
  constructor(private readonly adStrategyService: AdStrategyService) {}

  @Post('run')
  run(
    @Body()
    body: {
      companyId?: string;
      dryRun?: boolean;
      dailyBudgetLimit?: number;
    },
  ) {
    return this.adStrategyService.run(body);
  }

  @Post('results/:taskId')
  receiveResults(
    @Param('taskId') taskId: string,
    @Body() body: { actions?: unknown[]; summary?: Record<string, unknown> },
  ) {
    return this.adStrategyService.receiveResults(taskId, body);
  }

  @Get('status/:taskId')
  getStatus(@Param('taskId') taskId: string) {
    return this.adStrategyService.getStatus(taskId);
  }

  @Get('latest')
  getLatest(@Query('companyId') companyId?: string) {
    return this.adStrategyService.getLatestRun(companyId);
  }

  @Get('runs')
  getRuns(
    @Query('companyId') companyId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adStrategyService.getRuns({ companyId, limit });
  }
}
