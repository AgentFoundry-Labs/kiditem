import { BadRequestException, Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { RulesService } from '../services/rules.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { HeartbeatService } from '../../agent-registry/heartbeat/heartbeat.service';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  ListRulesQueryDto,
  UpdateRuleBodyDto,
  UpdateScheduleBodyDto,
} from '../dto';

@Controller('rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly heartbeat: HeartbeatService,
  ) {}

  @Post('evaluate')
  async evaluate(@CurrentCompany() companyId: string) {
    return this.rulesService.evaluateAll(companyId);
  }

  @Get('evaluate/status/:taskId')
  getEvaluationStatus(@Param('taskId') taskId: string) {
    return this.rulesService.getEvaluationStatus(taskId);
  }

  @Get('summary')
  async summary(@CurrentCompany() companyId: string) {
    return this.rulesService.getSummary(companyId);
  }

  @Get()
  async findAll(@CurrentCompany() companyId: string, @Query() query: ListRulesQueryDto) {
    return this.rulesService.findAllRules(companyId, query.category);
  }

  @Get('schedule')
  async getSchedule(@CurrentCompany() companyId: string) {
    const agent = await this.agentRegistry.findByType('rules_evaluation');
    return {
      schedule: agent.companyId === companyId ? agent.schedule ?? 'disabled' : 'disabled',
      options: [
        { key: '0 9 * * *', label: '1회/일 (오전 9시)' },
        { key: '0 9,18 * * *', label: '2회/일 (오전 9시, 오후 6시)' },
        { key: '0 */6 * * *', label: '4회/일 (6시간 간격)' },
        { key: 'disabled', label: '비활성화 (수동 실행만)' },
      ],
    };
  }

  @Get('suggest-thresholds')
  async suggestThresholds(@CurrentCompany() companyId: string) {
    return this.rulesService.suggestThresholds(companyId);
  }

  @Patch('schedule')
  async updateSchedule(
    @CurrentCompany() companyId: string,
    @Body() body: UpdateScheduleBodyDto,
  ) {
    const agent = await this.agentRegistry.findByType('rules_evaluation');
    if (agent.companyId !== companyId) {
      throw new BadRequestException(
        '룰 평가 스케줄은 tenant-owned rules_evaluation 에이전트에서만 변경할 수 있습니다.',
      );
    }
    const schedule = body.schedule === 'disabled' ? null : body.schedule;
    await this.agentRegistry.update(agent.id, companyId, { schedule });
    await this.heartbeat.syncTimers();
    return { ok: true, schedule: body.schedule };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRuleBodyDto) {
    return this.rulesService.updateRule(id, body);
  }
}
