import { Controller, Get, Query } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { AiUsageAgentKeySchema, type AiUsageSummary } from '@kiditem/shared/ai';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { AiUsageService } from '../../../application/service/ai-usage.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('ai/usage')
export class AiUsageController {
  constructor(private readonly usage: AiUsageService) {}

  /** AI token usage and estimated cost for `[from, to]` (KST dates), by agent and model. */
  @Get()
  summary(
    @CurrentOrganization() organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('agent') agent?: string,
  ): Promise<AiUsageSummary> {
    if (!from || !to || !DATE.test(from) || !DATE.test(to) || from > to) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'DATE_RANGE_INVALID' }, message: '조회 기간이 올바르지 않습니다. 시작일과 종료일을 확인해 주세요.' });
    }
    const agentKey = agent === undefined ? undefined : AiUsageAgentKeySchema.safeParse(agent);
    if (agentKey && !agentKey.success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'AGENT_UNKNOWN' }, message: '알 수 없는 에이전트입니다.' });
    }
    return this.usage.summary({ organizationId, from, to, agentKey: agentKey?.data });
  }
}
