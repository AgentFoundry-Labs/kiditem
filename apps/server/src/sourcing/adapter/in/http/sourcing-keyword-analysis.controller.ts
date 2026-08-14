import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { NaverKeywordResearchService } from '../../../application/service/naver-keyword-research.service';
import { SourcingKeywordAnalysisInputSchema } from '../../../domain/operation/sourcing.operations';

/** Read-only access to exact snapshots published by the keyword operation. */
@Controller('sourcing/keyword-analysis')
export class SourcingKeywordAnalysisController {
  constructor(private readonly keywordResearch: NaverKeywordResearchService) {}

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
