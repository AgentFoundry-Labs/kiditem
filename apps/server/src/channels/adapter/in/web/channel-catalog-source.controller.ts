import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  CHANNEL_CATALOG_COLLECTION_PORT,
  type ChannelCatalogCollectionPort,
} from '../../../application/port/in/channel-catalog-collection.port';

@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/accounts/:channelAccountId/catalog-imports/coupang-wing')
export class ChannelCatalogSourceController {
  constructor(
    @Inject(CHANNEL_CATALOG_COLLECTION_PORT)
    private readonly collection: ChannelCatalogCollectionPort,
  ) {}

  /** The account's latest browser import, which every 상품 받기 control reads (KID-147). */
  @Get('source')
  readSource(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.collection.readSource({ organizationId, channelAccountId });
  }
}
