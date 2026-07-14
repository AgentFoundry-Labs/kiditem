import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
  type ChannelSkuAvailabilityPort,
} from '../../../application/port/in/channel-sku-availability.port';
import { ChannelSkuAvailabilityQueryDto } from './dto/channel-sku-availability-query.dto';

@Controller('channels/sku-availability')
export class ChannelSkuAvailabilityController {
  constructor(
    @Inject(CHANNEL_SKU_AVAILABILITY_PORT)
    private readonly availability: ChannelSkuAvailabilityPort,
  ) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelSkuAvailabilityQueryDto,
  ) {
    return this.availability.list(organizationId, query);
  }
}
