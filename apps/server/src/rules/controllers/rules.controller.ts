import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RulesService } from '../services/rules.service';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import {
  ListRulesQueryDto,
  UpdateRuleBodyDto,
  UpdateScheduleBodyDto,
} from '../dto';

@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post('evaluate')
  async evaluate(@CurrentOrganization() organizationId: string) {
    return this.rulesService.evaluateAll(organizationId);
  }

  @Get('evaluate/status/:requestId')
  getEvaluationStatus(
    @CurrentOrganization() organizationId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.rulesService.getEvaluationStatus(organizationId, requestId);
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
  // TODO(agent-os v2): rewrite for new contracts.
  // Legacy `AgentScheduleControlPort` (tenant-owned `rules_evaluation` cron)
  // was deleted with `agent-registry`. Agent OS v2 will expose schedule
  // control on `AgentInstance.runtimeConfig` / `AgentRunRequest.scheduledFor`;
  // wire the GET endpoint there once that surface lands.
  getSchedule() {
    throw new ServiceUnavailableException(
      '룰 평가 스케줄 조회는 Agent OS v2 마이그레이션 중입니다.',
    );
  }

  @Get('suggest-thresholds')
  async suggestThresholds(@CurrentOrganization() organizationId: string) {
    return this.rulesService.suggestThresholds(organizationId);
  }

  @Patch('schedule')
  // TODO(agent-os v2): rewrite for new contracts.
  // Legacy `AgentScheduleControlPort.setSchedule` was deleted with
  // `agent-registry`. Agent OS v2 will expose schedule mutation through the
  // platform owner; the rules domain will call it once that surface lands.
  updateSchedule(@Body() _body: UpdateScheduleBodyDto) {
    throw new ServiceUnavailableException(
      '룰 평가 스케줄 변경은 Agent OS v2 마이그레이션 중입니다.',
    );
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
