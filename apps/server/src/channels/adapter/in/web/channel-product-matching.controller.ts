import { Inject } from '@nestjs/common';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CHANNEL_PRODUCT_MATCHING_PORT, type ChannelProductMatchingPort } from "../../../application/port/in/listing/channel-product-matching.port";
import { SELLPIA_MANUAL_MATCH_PORT, type SellpiaManualMatchPort } from "../../../application/port/in/listing/sellpia-manual-match.port";
import {
  ChannelMatchCandidateQueryDto,
  ChannelProductMatchingQueryDto,
} from './dto/channel-product-matching-query.dto';

@Controller('channels/product-mappings')
export class ChannelProductMatchingController {
  constructor(
    @Inject(CHANNEL_PRODUCT_MATCHING_PORT) private readonly matching: ChannelProductMatchingPort,
    @Inject(SELLPIA_MANUAL_MATCH_PORT) private readonly sellpiaManualMatches: SellpiaManualMatchPort,
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

  /**
   * 셀피아 수동상품매칭의 현재 — 최근 실행과 게시된 스냅샷. 시작·진행·중단은 실행 계약
   * (`channels.sellpia_manual_match`, KID-363)이 맡는다.
   */
  @Get('sellpia-manual-match/source')
  sellpiaManualMatchSource(
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sellpiaManualMatches.readSource(organizationId);
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
