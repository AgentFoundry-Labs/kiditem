import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from '../channel-business-exception.filter';
import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import {
  CHANNEL_LISTING_QUERY_PORT,
  type ChannelListingQueryPort,
} from '../../../../application/port/in/listing/channel-listing-query.port';
import { ChannelListingQueryDto } from './dto/channel-listing-query.dto';

@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/listings')
export class ChannelListingController {
  constructor(
    @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly listings: ChannelListingQueryPort,
  ) {}

  @Get(':listingId/workspace')
  async getWorkspace(
    @CurrentOrganization() organizationId: string,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
  ) {
    const workspace = await this.listings.getWorkspace(organizationId, listingId);
    if (!workspace) throw new NotFoundException('등록 상품을 찾을 수 없습니다.');
    return workspace;
  }

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelListingQueryDto,
  ) {
    return this.listings.list(organizationId, {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      channel: query.channel ?? null,
      channelAccountId: query.channelAccountId ?? null,
      search: query.search ?? null,
      createdSince: query.createdSince ?? null,
      tab: query.tab,
    });
  }
}
