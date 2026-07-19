import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ChannelListingDeletionService } from '../../../application/service/channel-listing-deletion.service';
import { ChannelListingQueryService } from '../../../application/service/channel-listing-query.service';
import { ChannelListingDeletionDto, ChannelListingQueryDto } from './dto';

@Controller('channels/listings')
export class ChannelListingController {
  constructor(
    private readonly listings: ChannelListingQueryService,
    private readonly deletion: ChannelListingDeletionService,
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

  /**
   * 1단계 — 삭제 인가. 아무것도 변경하지 않고, 마켓에서 지울 대상만 돌려준다.
   * 확장은 여기서 받은 `externalId` 로만 움직인다(클라이언트가 고른 값이 아니다).
   */
  @Post(':listingId/deletion-authorization')
  authorizeDeletion(
    @CurrentOrganization() organizationId: string,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @Body() body: ChannelListingDeletionDto,
  ) {
    return this.deletion.authorize(organizationId, listingId, body.password);
  }

  /**
   * 2단계 — 마켓 삭제가 끝난 뒤 우리 리스팅을 비활성화한다.
   * 비밀번호와 소유권을 **다시** 검증한다. 1단계 통과는 통행증이 아니다.
   */
  @Post(':listingId/deletion')
  finalizeDeletion(
    @CurrentOrganization() organizationId: string,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @Body() body: ChannelListingDeletionDto,
  ) {
    return this.deletion.finalize(organizationId, listingId, body.password);
  }
}
