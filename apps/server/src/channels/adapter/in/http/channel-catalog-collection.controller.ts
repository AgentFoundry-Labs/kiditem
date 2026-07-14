import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
  type FinalizeCoupangCatalogCollectionRequest,
  type PutCoupangCatalogChunkRequest,
  type StartCoupangCatalogCollectionRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  CHANNEL_CATALOG_COLLECTION_PORT,
  type ChannelCatalogCollectionPort,
} from '../../../application/port/in/channel-catalog-collection.port';

@Controller('channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs')
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
  ) {
    return this.collection.start({
      organizationId,
      userId: user.id,
      channelAccountId,
      request,
    });
  }

  @Get(':runId')
  getStatus(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.collection.getStatus({ organizationId, channelAccountId, runId });
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
  ) {
    const kind = CoupangCatalogChunkKindSchema.safeParse(rawKind);
    if (!kind.success) throw new BadRequestException('Unknown catalog chunk kind');
    return this.collection.putChunk({
      organizationId,
      userId: user.id,
      channelAccountId,
      runId,
      kind: kind.data,
      sequence,
      request,
    });
  }

  @Post(':runId/errors')
  recordError(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
    @Body() request: CoupangCatalogCollectionErrorRequest,
  ) {
    return this.collection.recordError({
      organizationId,
      channelAccountId,
      runId,
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
  ) {
    return this.collection.finalize({
      organizationId,
      userId: user.id,
      channelAccountId,
      runId,
      request,
    });
  }
}
