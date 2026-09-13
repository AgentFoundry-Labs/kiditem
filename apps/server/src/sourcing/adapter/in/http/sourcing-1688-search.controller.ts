import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Sourcing1688KeywordSearchService } from '../../../application/service/sourcing-1688-keyword-search.service';
import { Sourcing1688ImageSearchService } from '../../../application/service/sourcing-1688-image-search.service';
import { toPublicAttempt } from './sourcing-source-attempt-http';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('sourcing/wholesale/1688')
export class Sourcing1688SearchController {
  constructor(private readonly keywords: Sourcing1688KeywordSearchService, private readonly images: Sourcing1688ImageSearchService) {}

  @Post('keyword-search')
  async searchKeywords(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string, @Body() input: unknown) {
    const result = await this.keywords.search({ organizationId, requestedByUserId: user.id, idempotencyKey: idempotencyKey ?? '', input });
    return { ...result, attempts: result.attempts.map(toPublicAttempt) };
  }

  @Post('image-matches')
  async matchImages(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string, @Body() input: unknown) {
    const result = await this.images.search({ organizationId, requestedByUserId: user.id, idempotencyKey: idempotencyKey ?? '', input });
    return { ...result, attempts: result.attempts.map(toPublicAttempt) };
  }

  @Get('keyword-search/:attemptId')
  async readKeywordAttempt(@Param('attemptId', ParseUUIDPipe) attemptId: string, @CurrentOrganization() organizationId: string) {
    const result = await this.keywords.read({ organizationId, attemptId });
    return { ...result, attempt: toPublicAttempt(result.attempt) };
  }

  @Get('image-matches/:attemptId')
  async readImageAttempt(@Param('attemptId', ParseUUIDPipe) attemptId: string, @CurrentOrganization() organizationId: string) {
    const result = await this.images.read({ organizationId, attemptId });
    return { ...result, attempt: toPublicAttempt(result.attempt) };
  }
}
