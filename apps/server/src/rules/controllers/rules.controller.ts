import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { RulesService } from '../services/rules.service';
import { RulesSchedulerService } from '../services/rules-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ListRulesQueryDto,
  EvaluateRulesQueryDto,
  ReceiveRuleResultsBodyDto,
  UpdateRuleBodyDto,
  UpdateScheduleBodyDto,
} from '../dto';

@Controller('rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    private readonly schedulerService: RulesSchedulerService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Post('evaluate')
  async evaluate(@Query() query: EvaluateRulesQueryDto) {
    return this.rulesService.evaluateAll(await this.resolveCompanyId(query.companyId));
  }

  @Post('results/:taskId')
  receiveResults(@Param('taskId') taskId: string, @Body() body: ReceiveRuleResultsBodyDto) {
    return this.rulesService.receiveResults(taskId, body);
  }

  @Get('evaluate/status/:taskId')
  getEvaluationStatus(@Param('taskId') taskId: string) {
    return this.rulesService.getEvaluationStatus(taskId);
  }

  @Get('summary')
  async summary(@Query('companyId') companyId?: string) {
    return this.rulesService.getSummary(await this.resolveCompanyId(companyId));
  }

  @Get()
  async findAll(@Query() query: ListRulesQueryDto) {
    return this.rulesService.findAllRules(
      await this.resolveCompanyId(query.companyId),
      query.category,
    );
  }

  @Get('schedule')
  async getSchedule() {
    const schedule = await this.schedulerService.getSchedule();
    const options = this.schedulerService.getScheduleOptions();
    return { schedule, options };
  }

  @Get('suggest-thresholds')
  async suggestThresholds(@Query('companyId') companyId?: string) {
    return this.rulesService.suggestThresholds(await this.resolveCompanyId(companyId));
  }

  @Patch('schedule')
  updateSchedule(@Body() body: UpdateScheduleBodyDto) {
    return this.schedulerService.setSchedule(body.schedule);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRuleBodyDto) {
    return this.rulesService.updateRule(id, body);
  }
}
