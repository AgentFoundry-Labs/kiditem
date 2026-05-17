import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ChannelListingQueryService } from '../../../application/service/channel-listing-query.service';
import { MarketplaceRegistrationService } from '../../../application/service/marketplace-registration.service';
import { ChannelListingQueryDto, MarketplaceRegistrationDto } from './dto';

@Controller('channels/listings')
export class ChannelListingController {
  constructor(
    private readonly listings: ChannelListingQueryService,
    private readonly marketplaceRegistration: MarketplaceRegistrationService,
  ) {}

  @Post('confirmed')
  registerConfirmedListing(
    @CurrentOrganization() organizationId: string,
    @Body() body: MarketplaceRegistrationDto,
  ) {
    return this.marketplaceRegistration.registerConfirmedListing(organizationId, body);
  }

  @Get('groups')
  listGrouped(
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelListingQueryDto,
  ) {
    return this.listings.listGrouped(organizationId, {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      channel: query.channel ?? null,
      channelAccountId: query.channelAccountId ?? null,
      search: query.search ?? null,
      tab: query.tab,
    });
  }

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
      tab: query.tab,
    });
  }
}
