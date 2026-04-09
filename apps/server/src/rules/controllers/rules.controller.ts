import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { RulesService } from '../services/rules.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { HeartbeatService } from '../../agent-registry/heartbeat/heartbeat.service';
import { CompanyResolverService } from '../../common/company-resolver.service';
import {
  ListRulesQueryDto,
  EvaluateRulesQueryDto,
  UpdateRuleBodyDto,
  UpdateScheduleBodyDto,
} from '../dto';

@Controller('rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly heartbeat: HeartbeatService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Post('evaluate')
  async evaluate(@Query() query: EvaluateRulesQueryDto) {
    return this.rulesService.evaluateAll(await this.companyResolver.resolve());
  }

  @Get('evaluate/status/:taskId')
  getEvaluationStatus(@Param('taskId') taskId: string) {
    return this.rulesService.getEvaluationStatus(taskId);
  }

  @Get('summary')
  async summary(@Query('companyId') companyId?: string) {
    return this.rulesService.getSummary(await this.companyResolver.resolve());
  }

  @Get()
  async findAll(@Query() query: ListRulesQueryDto) {
    return this.rulesService.findAllRules(
      await this.companyResolver.resolve(),
      query.category,
    );
  }

  @Get('schedule')
  async getSchedule() {
    const agent = await this.agentRegistry.findByType('rules_evaluation');
    return {
      schedule: agent.schedule ?? 'disabled',
      options: [
        { key: '0 9 * * *', label: '1회/일 (오전 9시)' },
        { key: '0 9,18 * * *', label: '2회/일 (오전 9시, 오후 6시)' },
        { key: '0 */6 * * *', label: '4회/일 (6시간 간격)' },
        { key: 'disabled', label: '비활성화 (수동 실행만)' },
      ],
    };
  }

  @Get('suggest-thresholds')
  async suggestThresholds(@Query('companyId') companyId?: string) {
    return this.rulesService.suggestThresholds(await this.companyResolver.resolve());
  }

  @Patch('schedule')
  async updateSchedule(@Body() body: UpdateScheduleBodyDto) {
    const agent = await this.agentRegistry.findByType('rules_evaluation');
    const schedule = body.schedule === 'disabled' ? null : body.schedule;
    await this.agentRegistry.update(agent.id, { schedule });
    await this.heartbeat.syncTimers();
    return { ok: true, schedule: body.schedule };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRuleBodyDto) {
    return this.rulesService.updateRule(id, body);
  }
}
