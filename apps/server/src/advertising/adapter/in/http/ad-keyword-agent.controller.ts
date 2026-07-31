import { Body, Controller, Post } from '@nestjs/common';
import { AdKeywordAgentService } from '../../../application/service/ad-keyword-agent.service';
import { RunAdKeywordAgentBodyDto } from './dto/ad-keyword-agent';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

/**
 * Keyword relevance classification. Judges collected keywords against the
 * product they advertise and files `pause_keyword` proposals for the ones that
 * do not fit. It never pauses an ad — every proposal waits for approval.
 */
@Controller('ads/keywords/agent')
export class AdKeywordAgentController {
  constructor(private readonly adKeywordAgentService: AdKeywordAgentService) {}

  @Post('run')
  run(
    @Body() body: RunAdKeywordAgentBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adKeywordAgentService.run({
      organizationId,
      triggeredByUserId: user.id,
      externalOptionId: body.externalOptionId ?? null,
    });
  }
}
