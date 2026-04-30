import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RulesService } from '../services/rules.service';
import {
  AGENT_SCHEDULE_CONTROL_PORT,
  AgentScheduleControlPort,
  TenantOwnedAgentRequiredError,
} from '../../automation/application/port/in/agent-schedule-control.port';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  ListRulesQueryDto,
  UpdateRuleBodyDto,
  UpdateScheduleBodyDto,
} from '../dto';

const RULES_EVALUATION_AGENT_TYPE = 'rules_evaluation';

@Controller('rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    @Inject(AGENT_SCHEDULE_CONTROL_PORT)
    private readonly scheduleControl: AgentScheduleControlPort,
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
    const { schedule } = await this.scheduleControl.getSchedule(
      RULES_EVALUATION_AGENT_TYPE,
      companyId,
    );
    return {
      schedule,
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
    const next = body.schedule === 'disabled' ? null : body.schedule;
    try {
      await this.scheduleControl.setSchedule(
        RULES_EVALUATION_AGENT_TYPE,
        companyId,
        next,
      );
    } catch (err) {
      if (err instanceof TenantOwnedAgentRequiredError) {
        throw new BadRequestException(
          '룰 평가 스케줄은 tenant-owned rules_evaluation 에이전트에서만 변경할 수 있습니다.',
        );
      }
      throw err;
    }
    return { ok: true, schedule: body.schedule };
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() body: UpdateRuleBodyDto,
  ) {
    return this.rulesService.updateRule(id, companyId, body);
  }
}
