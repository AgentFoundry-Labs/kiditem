import { Body, Controller, Get, Inject, Param, Patch, ParseUUIDPipe, Query, UseFilters } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
  type ChannelSkuAvailabilityPort,
} from '../../../application/port/in/channel-sku-availability.port';
import { IsInt, Max, Min } from 'class-validator';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';

class UpdateSafetyStockDto {
  @IsInt()
  @Min(0)
  @Max(2147483647)
  safetyStock!: number;
}

import { ChannelSkuAvailabilityQueryDto } from './dto/channel-sku-availability-query.dto';

@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/sku-availability')
export class ChannelSkuAvailabilityController {
  constructor(
    @Inject(CHANNEL_SKU_AVAILABILITY_PORT)
    private readonly availability: ChannelSkuAvailabilityPort,
  ) {}

  @Patch(':optionId/safety-stock')
  updateSafetyStock(
    @CurrentOrganization() organizationId: string,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() input: UpdateSafetyStockDto,
  ) {
    return this.availability.updateSafetyStock(organizationId, optionId, input.safetyStock);
  }

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelSkuAvailabilityQueryDto,
  ) {
    return this.availability.list(organizationId, query);
  }
}
