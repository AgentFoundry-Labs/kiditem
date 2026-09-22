import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from '../channel-business-exception.filter';
import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { CHANNEL_LISTING_DELETION_PORT, type ChannelListingDeletionPort } from "../../../../application/port/in/listing/channel-listing-deletion.port";
import {
  CHANNEL_LISTING_QUERY_PORT,
  type ChannelListingQueryPort,
} from '../../../../application/port/in/listing/channel-listing-query.port';
import {
  ChannelListingDeletionDto,
  ChannelListingDeletionUnresolvedDto,
  ChannelListingQueryDto,
} from './dto/channel-listing-query.dto';

@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/listings')
export class ChannelListingController {
  constructor(
    @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly listings: ChannelListingQueryPort,
    @Inject(CHANNEL_LISTING_DELETION_PORT) private readonly deletion: ChannelListingDeletionPort,
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

  /**
   * Password verification happens before listing facts. A matching active operation
   * is resumed so a lost browser response can be reconciled without deleting twice.
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

  /** Called from the authenticated extension worker, never from page-world code. */
  @Post(':listingId/deletion-operations/:operationId/extension-claim')
  claimDeletionExecution(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @Param('operationId', new ParseUUIDPipe()) operationId: string,
  ) {
    return this.deletion.claimExecution({ organizationId, userId: user.id, listingId, operationId });
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

  @Post(':listingId/deletion-reconciliation')
  reconcileObservedDeletion(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @Body('operationId', new ParseUUIDPipe()) operationId: string,
  ) {
    return this.deletion.reconcileObservedDeletion({
      organizationId,
      userId: user.id,
      listingId,
      operationId,
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
