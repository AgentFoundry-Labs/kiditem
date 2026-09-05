import { BadRequestException, Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { SourcingKeywordAnalysisInputSchema } from '@kiditem/shared/sourcing';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { toPublicAttempt, toPublicStatus } from './sourcing-source-attempt-http';
import { NaverKeywordResearchService } from '../../../application/service/naver-keyword-research.service';

/** Direct source collection and exact COMPLETE evidence reads. */
@Controller('sourcing/keyword-analysis')
export class SourcingKeywordAnalysisController {
  constructor(private readonly keywordResearch: NaverKeywordResearchService) {}

  @Post('collect')
  async collect(@Body() input: Record<string, unknown>, @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser, @Headers('idempotency-key') idempotencyKey: string) {
    const result = await this.keywordResearch.collectAnalysis({ organizationId, input,
      requestedByUserId: user.id, idempotencyKey });
    return { ...result, attempt: toPublicAttempt(result.attempt) };
  }

  @Get('status')
  async status(@Query('input') rawInput: string | undefined, @CurrentOrganization() organizationId: string) {
    return toPublicStatus(await this.keywordResearch.status(organizationId, parseKeywordAnalysisInput(rawInput)));
  }

  @Get('snapshot')
  snapshot(
    @Query('input') rawInput: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordResearch.getAnalysisSnapshot(
      organizationId,
      parseKeywordAnalysisInput(rawInput),
    );
  }
}

function parseKeywordAnalysisInput(rawInput: string | undefined): Record<string, unknown> {
  if (!rawInput || rawInput.length > 8_192) {
    throw new BadRequestException('invalid_keyword_analysis_input');
  }
  try {
    const value: unknown = JSON.parse(rawInput);
    const parsed = SourcingKeywordAnalysisInputSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('invalid_keyword_analysis_input');
    return parsed.data;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('invalid_keyword_analysis_input');
  }
}
