import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  Sourcing1688ImageMatchInputSchema,
  Sourcing1688KeywordBatchInputSchema,
} from '@kiditem/shared/sourcing';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { Sourcing1688SearchResultService } from '../../../application/service/sourcing-1688-search-result.service';

@Controller('sourcing/wholesale/1688-results')
export class Sourcing1688SearchResultController {
  constructor(private readonly results: Sourcing1688SearchResultService) {}

  @Get()
  async latest(
    @Query('keyword') rawKeywords: string | string[] | undefined,
    @Query('targetId') rawTargetIds: string | string[] | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    try {
      const keywordValues = repeatedValues(rawKeywords);
      const targetValues = repeatedValues(rawTargetIds);
      const keywords = keywordValues.length > 0
        ? Sourcing1688KeywordBatchInputSchema.parse({ keywords: keywordValues }).keywords
        : undefined;
      const targetIds = targetValues.length > 0
        ? Sourcing1688ImageMatchInputSchema.parse({ targetIds: targetValues }).targetIds
        : undefined;
      return this.results.latest({ organizationId, keywords, targetIds });
    } catch {
      throw new BadRequestException('invalid_1688_result_query');
    }
  }
}

function repeatedValues(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim());
}
