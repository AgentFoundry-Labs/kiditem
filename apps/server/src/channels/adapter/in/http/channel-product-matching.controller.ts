import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ChannelProductMatchingService } from '../../../application/service/channel-product-matching.service';
import { SellpiaManualMatchService } from '../../../application/service/sellpia-manual-match.service';
import {
  ChannelMatchCandidateQueryDto,
  ChannelProductMatchingQueryDto,
} from './dto/channel-product-matching-query.dto';

@Controller('channels/product-mappings')
export class ChannelProductMatchingController {
  constructor(
    private readonly matching: ChannelProductMatchingService,
    private readonly sellpiaManualMatches: SellpiaManualMatchService,
  ) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelProductMatchingQueryDto,
  ) {
    return this.matching.list(organizationId, query);
  }

  @Post('auto-match')
  autoMatch(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.matching.autoMatch(organizationId, body);
  }

  @Get('sellpia-manual-match/targets')
  sellpiaManualMatchTargets(
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sellpiaManualMatches.targets(organizationId);
  }

  @Post('sellpia-manual-match/attempts')
  beginSellpiaManualMatch(
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 128) {
      throw new BadRequestException('INVALID_SELLPIA_MANUAL_MATCH_IDEMPOTENCY_KEY');
    }
    return this.sellpiaManualMatches.beginAttempt({
      organizationId,
      idempotencyKey,
    });
  }

  @Get('sellpia-manual-match/attempts/current')
  sellpiaManualMatchCurrent(
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sellpiaManualMatches.readCurrent(organizationId);
  }

  @Get('sellpia-manual-match/attempts/:attemptId')
  sellpiaManualMatchAttempt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.sellpiaManualMatches.readAttempt({ organizationId, attemptId });
  }

  @Post('sellpia-manual-match/attempts/:attemptId/complete')
  completeSellpiaManualMatch(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() body: unknown,
  ) {
    if (!attemptToken?.trim()) {
      throw new BadRequestException('INVALID_SELLPIA_MANUAL_MATCH_ATTEMPT_TOKEN');
    }
    return this.sellpiaManualMatches.completeAttempt({
      organizationId,
      attemptId,
      attemptToken,
      snapshot: body,
    });
  }

  @Post('sellpia-manual-match/attempts/:attemptId/fail')
  failSellpiaManualMatch(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() body: unknown,
  ) {
    if (!attemptToken?.trim()) {
      throw new BadRequestException('INVALID_SELLPIA_MANUAL_MATCH_ATTEMPT_TOKEN');
    }
    const failure = parseFailure(body);
    return this.sellpiaManualMatches.failAttempt({
      organizationId,
      attemptId,
      attemptToken,
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
    });
  }

  @Get(':channelListingId/candidates')
  productCandidates(
    @Param('channelListingId', new ParseUUIDPipe()) channelListingId: string,
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelMatchCandidateQueryDto,
  ) {
    return this.matching.productCandidates(organizationId, channelListingId, query);
  }

  @Put(':channelListingId/master-product')
  linkProduct(
    @Param('channelListingId', new ParseUUIDPipe()) channelListingId: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.matching.linkProduct(organizationId, channelListingId, body);
  }
}

function parseFailure(body: unknown): { errorCode: string; errorMessage: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('INVALID_SELLPIA_MANUAL_MATCH_FAILURE');
  }
  const value = body as Record<string, unknown>;
  if (
    typeof value.errorCode !== 'string'
    || typeof value.errorMessage !== 'string'
    || !value.errorCode.trim()
    || !value.errorMessage.trim()
    || value.errorCode.trim().length > 100
    || value.errorMessage.trim().length > 300
  ) {
    throw new BadRequestException('INVALID_SELLPIA_MANUAL_MATCH_FAILURE');
  }
  return {
    errorCode: value.errorCode.trim(),
    errorMessage: value.errorMessage.trim(),
  };
}
