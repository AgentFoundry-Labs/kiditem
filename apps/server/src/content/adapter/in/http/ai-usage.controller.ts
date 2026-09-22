import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
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
      throw new BadRequestException('from and to must be YYYY-MM-DD with from <= to');
    }
    const agentKey = agent === undefined ? undefined : AiUsageAgentKeySchema.safeParse(agent);
    if (agentKey && !agentKey.success) throw new BadRequestException('unknown agent');
    return this.usage.summary({ organizationId, from, to, agentKey: agentKey?.data });
  }
}
