import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AdCampaignSourceAttemptSchema,
  AdCampaignSourceBeginSchema,
  AdCampaignSourceCompleteSchema,
  AdCampaignSourceFailureSchema,
  AdCampaignManualReportsSchema,
  AdCampaignSourceReceiptInputSchema,
} from '@kiditem/shared/advertising';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { AdCampaignSourceRepository } from '../../out/repository/ad-campaign-source.repository';

@Controller('ads')
export class AdCampaignSourceController {
  constructor(private readonly owner: AdCampaignSourceRepository) {}
  @Post('ad-campaigns/attempts')
  async begin(
    @CurrentOrganization() org: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() raw: unknown,
  ) {
    const input = AdCampaignSourceBeginSchema.safeParse(raw);
    if (!input.success || !key?.trim() || key.length > 128)
      throw new BadRequestException('INVALID_AD_CAMPAIGN_BEGIN');
    return AdCampaignSourceAttemptSchema.parse(await this.owner.begin(org, key, input.data));
  }
  @Get('ad-campaigns/source')
  source(@CurrentOrganization() org: string, @Query('channelAccountId') accountId?: string) {
    if (accountId && !z.string().uuid().safeParse(accountId).success)
      throw new BadRequestException('INVALID_COUPANG_ACCOUNT');
    return this.owner.source(org, accountId);
  }
  @Get('ad-campaigns/reports')
  async reports(
    @CurrentOrganization() org: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!startDate || !endDate || !z.string().date().safeParse(startDate).success || !z.string().date().safeParse(endDate).success)
      throw new BadRequestException('INVALID_MANUAL_REPORT_RANGE');
    return AdCampaignManualReportsSchema.parse(
      await this.owner.readManualReports(org, startDate, endDate),
    );
  }
  @Get('ad-campaigns/attempts/:id')
  read(@CurrentOrganization() org: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.owner.read(org, id);
  }
  @Get('ad-campaigns/attempts/:id/control')
  control(@CurrentOrganization() org: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.owner.read(org, id, true);
  }
  @Put('ad-campaigns/attempts/:id/receipts/:sequence')
  capture(
    @CurrentOrganization() org: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('sequence', ParseIntPipe) sequence: number,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const input = AdCampaignSourceReceiptInputSchema.safeParse(raw);
    if (!input.success || sequence < 0 || !z.string().uuid().safeParse(token).success)
      throw new BadRequestException('INVALID_CAMPAIGN_RECEIPT');
    return this.owner.capture(org, id, token, sequence, input.data);
  }
  @Post('ad-campaigns/attempts/:id/complete')
  complete(
    @CurrentOrganization() org: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const input = AdCampaignSourceCompleteSchema.safeParse(raw);
    if (!input.success || !z.string().uuid().safeParse(token).success)
      throw new BadRequestException('INVALID_CAMPAIGN_MANIFEST');
    return this.owner.complete(org, id, token, input.data.manifestChecksum);
  }
  @Post('ad-campaigns/attempts/:id/fail')
  fail(
    @CurrentOrganization() org: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const input = AdCampaignSourceFailureSchema.safeParse(raw);
    if (!input.success || !z.string().uuid().safeParse(token).success)
      throw new BadRequestException('INVALID_CAMPAIGN_FAILURE');
    return this.owner.fail(org, id, token, input.data.code, input.data.message);
  }
}
