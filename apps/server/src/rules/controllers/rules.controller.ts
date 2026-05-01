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
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
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
  async evaluate(@CurrentOrganization() organizationId: string) {
    return this.rulesService.evaluateAll(organizationId);
  }

  @Get('evaluate/status/:taskId')
  getEvaluationStatus(@Param('taskId') taskId: string) {
    return this.rulesService.getEvaluationStatus(taskId);
  }

  @Get('summary')
  async summary(@CurrentOrganization() organizationId: string) {
    return this.rulesService.getSummary(organizationId);
  }

  @Get()
  async findAll(@CurrentOrganization() organizationId: string, @Query() query: ListRulesQueryDto) {
    return this.rulesService.findAllRules(organizationId, query.category);
  }

  @Get('schedule')
  async getSchedule(@CurrentOrganization() organizationId: string) {
    const { schedule } = await this.scheduleControl.getSchedule(
      RULES_EVALUATION_AGENT_TYPE,
      organizationId,
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
  async suggestThresholds(@CurrentOrganization() organizationId: string) {
    return this.rulesService.suggestThresholds(organizationId);
  }

  @Patch('schedule')
  async updateSchedule(
    @CurrentOrganization() organizationId: string,
    @Body() body: UpdateScheduleBodyDto,
  ) {
    const next = body.schedule === 'disabled' ? null : body.schedule;
    try {
      await this.scheduleControl.setSchedule(
        RULES_EVALUATION_AGENT_TYPE,
        organizationId,
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
    @CurrentOrganization() organizationId: string,
    @Body() body: UpdateRuleBodyDto,
  ) {
    return this.rulesService.updateRule(id, organizationId, body);
  }
}
