import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { KiditemNotFoundError } from '@kiditem/shared/errors';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import {
  CHANNEL_LISTING_QUERY_PORT,
  type ChannelListingQueryPort,
} from '../../../../application/port/in/listing/channel-listing-query.port';
import { ChannelListingQueryDto } from './dto/channel-listing-query.dto';

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
    if (!workspace) throw new KiditemNotFoundError('CHANNELS_LISTING_NOT_FOUND');
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
