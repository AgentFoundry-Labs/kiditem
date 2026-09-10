import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  CoupangCatalogChunkKindSchema,
  type CoupangCatalogCollectionErrorRequest,
  type CoupangCatalogCollectionPauseRequest,
  type FinalizeCoupangCatalogCollectionRequest,
  type PutCoupangCatalogChunkRequest,
  type StartCoupangCatalogCollectionRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  CHANNEL_CATALOG_COLLECTION_PORT,
  type ChannelCatalogCollectionPort,
} from '../../../application/port/in/channel-catalog-collection.port';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('channels/accounts/:channelAccountId/catalog-imports/coupang-wing/attempts')
export class ChannelCatalogCollectionController {
  constructor(
    @Inject(CHANNEL_CATALOG_COLLECTION_PORT)
    private readonly collection: ChannelCatalogCollectionPort,
  ) {}

  @Post()
  start(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() request: StartCoupangCatalogCollectionRequest,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.collection.start({
      organizationId,
      userId: user.id,
      channelAccountId,
      idempotencyKey,
      request,
    });
  }

  @Get(':runId')
  getStatus(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.collection.getStatus({
      organizationId,
      channelAccountId,
      runId,
    });
  }

  @Put(':runId/chunks/:kind/:sequence')
  putChunk(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Param('kind') rawKind: string,
    @Param('sequence', new ParseIntPipe()) sequence: number,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() request: PutCoupangCatalogChunkRequest,
    @Headers('x-source-attempt-token') attemptToken: string,
  ) {
    const kind = CoupangCatalogChunkKindSchema.safeParse(rawKind);
    if (!kind.success) throw new BadRequestException('Unknown catalog chunk kind');
    return this.collection.putChunk({
      organizationId,
      userId: user.id,
      channelAccountId,
      runId,
      attemptToken,
      kind: kind.data,
      sequence,
      request,
    });
  }

  @Post(':runId/pause')
  pause(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
    @Body() request: CoupangCatalogCollectionPauseRequest,
    @Headers('x-source-attempt-token') attemptToken: string,
  ) {
    return this.collection.pause({
      organizationId,
      channelAccountId,
      runId,
      attemptToken,
      request,
    });
  }

  @Post(':runId/fail')
  fail(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
    @Body() request: CoupangCatalogCollectionErrorRequest,
    @Headers('x-source-attempt-token') attemptToken: string,
  ) {
    return this.collection.fail({
      organizationId,
      channelAccountId,
      runId,
      attemptToken,
      request,
    });
  }

  @Post(':runId/finalize')
  finalize(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() request: FinalizeCoupangCatalogCollectionRequest,
    @Headers('x-source-attempt-token') attemptToken: string,
  ) {
    return this.collection.finalize({
      organizationId,
      userId: user.id,
      channelAccountId,
      runId,
      attemptToken,
      request,
    });
  }
}
