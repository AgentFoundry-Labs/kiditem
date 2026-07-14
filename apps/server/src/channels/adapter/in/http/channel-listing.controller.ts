import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ChannelListingQueryService } from '../../../application/service/channel-listing-query.service';
import { ChannelListingQueryDto } from './dto';

@Controller('channels/listings')
export class ChannelListingController {
  constructor(
    private readonly listings: ChannelListingQueryService,
  ) {}

  @Get(':listingId/workspace')
  getWorkspace(
    @CurrentOrganization() organizationId: string,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
  ) {
    return this.listings.getWorkspace(organizationId, listingId);
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
