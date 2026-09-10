import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  AdKeywordSourceBeginSchema,
  AdKeywordSourceAttemptSchema,
  AdKeywordRosterSchema,
  AdKeywordGroupPlanSchema,
  AdKeywordGroupResultSchema,
  AdKeywordSourceCompleteSchema,
  AdKeywordSourceFailureSchema,
} from '@kiditem/shared/advertising';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { AdKeywordSourceRepository } from '../../out/repository/ad-keyword-source.repository';

@Controller('ads/ad-keywords')
export class AdKeywordSourceController {
  constructor(private readonly owner: AdKeywordSourceRepository) {}
  @Post('attempts')
  async begin(
    @CurrentOrganization() org: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() raw: unknown,
  ) {
    const input = AdKeywordSourceBeginSchema.safeParse(raw);
    if (!input.success || !key?.trim() || key.length > 128)
      throw new BadRequestException('INVALID_AD_KEYWORD_BEGIN');
    return AdKeywordSourceAttemptSchema.parse(await this.owner.begin(org, key, input.data));
  }
  @Get('source')
  source(@CurrentOrganization() org: string, @Query('channelAccountId') accountId?: string) {
    if (accountId && !z.string().uuid().safeParse(accountId).success)
      throw new BadRequestException('INVALID_COUPANG_ACCOUNT');
    return this.owner.source(org, accountId);
  }
  @Get('attempts/:attemptId')
  read(@CurrentOrganization() org: string, @Param('attemptId', new ParseUUIDPipe()) id: string) {
    return this.owner.read(org, id);
  }
  @Get('attempts/:attemptId/control')
  control(@CurrentOrganization() org: string, @Param('attemptId', new ParseUUIDPipe()) id: string) {
    return this.owner.read(org, id, true);
  }
  @Put('attempts/:attemptId/roster')
  roster(
    @CurrentOrganization() org: string,
    @Param('attemptId', new ParseUUIDPipe()) id: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const input = AdKeywordRosterSchema.safeParse(raw);
    if (!input.success || !z.string().uuid().safeParse(token).success)
      throw new BadRequestException('INVALID_KEYWORD_ROSTER');
    return this.owner.captureRoster(org, id, token, input.data);
  }
  @Put('attempts/:attemptId/groups/:sequence/plan')
  groupPlan(
    @CurrentOrganization() org: string,
    @Param('attemptId', new ParseUUIDPipe()) id: string,
    @Param('sequence', ParseIntPipe) sequence: number,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const input = AdKeywordGroupPlanSchema.safeParse(raw);
    if (!input.success || sequence < 0 || !z.string().uuid().safeParse(token).success)
      throw new BadRequestException('INVALID_KEYWORD_GROUP_PLAN');
    return this.owner.captureGroupPlan(org, id, token, sequence, input.data);
  }
  @Put('attempts/:attemptId/groups/:sequence/result')
  groupResult(
    @CurrentOrganization() org: string,
    @Param('attemptId', new ParseUUIDPipe()) id: string,
    @Param('sequence', ParseIntPipe) sequence: number,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const input = AdKeywordGroupResultSchema.safeParse(raw);
    if (!input.success || sequence < 0 || !z.string().uuid().safeParse(token).success)
      throw new BadRequestException('INVALID_KEYWORD_GROUP_RESULT');
    return this.owner.captureGroupResult(org, id, token, sequence, input.data);
  }
  @Post('attempts/:attemptId/complete')
  complete(
    @CurrentOrganization() org: string,
    @Param('attemptId', new ParseUUIDPipe()) id: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const input = AdKeywordSourceCompleteSchema.safeParse(raw);
    if (!input.success || !z.string().uuid().safeParse(token).success)
      throw new BadRequestException('INVALID_KEYWORD_MANIFEST');
    return this.owner.complete(org, id, token, input.data.manifestChecksum);
  }
  @Post('attempts/:attemptId/fail')
  fail(
    @CurrentOrganization() org: string,
    @Param('attemptId', new ParseUUIDPipe()) id: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const input = AdKeywordSourceFailureSchema.safeParse(raw);
    if (!input.success || !z.string().uuid().safeParse(token).success)
      throw new BadRequestException('INVALID_KEYWORD_FAILURE');
    return this.owner.fail(org, id, token, input.data.code, input.data.message);
  }
}
