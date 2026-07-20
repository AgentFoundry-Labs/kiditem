import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { ChannelListingDeletionService } from '../../../application/service/channel-listing-deletion.service';
import { ChannelListingQueryService } from '../../../application/service/channel-listing-query.service';
import {
  ChannelListingDeletionCompletionDto,
  ChannelListingDeletionDto,
  ChannelListingDeletionUnresolvedDto,
  ChannelListingQueryDto,
} from './dto';

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
   * Password verification happens before listing facts. The returned operation is
   * already durably `executing/uncertain`, so a lost browser response is reconcilable.
   */
  @Post(':listingId/deletion-authorization')
  authorizeDeletion(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @Body() body: ChannelListingDeletionDto,
  ) {
    return this.deletion.authorize({
      organizationId,
      userId: user.id,
      listingId,
      password: body.password,
      idempotencyKey: body.idempotencyKey,
    });
  }

  /**
   * Provider-confirmed completion: password is not requested a second time.
   */
  @Post(':listingId/deletion')
  completeDeletion(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @Body() body: ChannelListingDeletionCompletionDto,
  ) {
    return this.deletion.complete({
      organizationId,
      userId: user.id,
      listingId,
      operationId: body.operationId,
      evidence: body.evidence,
    });
  }

  @Post(':listingId/deletion-unresolved')
  markDeletionUnresolved(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @Body() body: ChannelListingDeletionUnresolvedDto,
  ) {
    return this.deletion.markUnresolved({
      organizationId,
      userId: user.id,
      listingId,
      operationId: body.operationId,
      reason: body.reason,
    });
  }

  @Get(':listingId/deletion-operations/:operationId')
  async getDeletionStatus(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @Param('operationId', new ParseUUIDPipe()) operationId: string,
  ) {
    const operation = await this.deletion.getStatus({ organizationId, userId: user.id, listingId, operationId });
    if (!operation) throw new NotFoundException('Deletion operation not found.');
    return operation;
  }
}
