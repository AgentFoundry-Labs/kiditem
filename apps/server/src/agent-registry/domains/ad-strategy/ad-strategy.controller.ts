import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { AdStrategyService } from './ad-strategy.service';
import { RunAdStrategyBodyDto, ReceiveAdResultsBodyDto, ListAdRunsQueryDto } from './dto';

@Controller('ad-agent')
export class AdStrategyController {
  constructor(private readonly adStrategyService: AdStrategyService) {}

  @Post('run')
  run(@Body() body: RunAdStrategyBodyDto) {
    return this.adStrategyService.run(body);
  }

  @Post('results/:taskId')
  receiveResults(@Param('taskId') taskId: string, @Body() body: ReceiveAdResultsBodyDto) {
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
  getRuns(@Query() query: ListAdRunsQueryDto) {
    return this.adStrategyService.getRuns(query as any);
  }
}
