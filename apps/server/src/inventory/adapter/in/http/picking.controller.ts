import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  PICKING_PORT,
  type PickingPort,
} from '../../../application/port/in/fulfillment/picking.port';
import { UpdatePickingItemDto } from './dto';

@Controller('picking')
export class PickingController {
  constructor(
    @Inject(PICKING_PORT) private readonly picking: PickingPort,
  ) {}

  @Get()
  findAll(@CurrentOrganization() organizationId: string) {
    return this.picking.findAll(organizationId);
  }

  @Post('generate')
  generate(@CurrentOrganization() organizationId: string) {
    return this.picking.generate(organizationId);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentOrganization() organizationId: string,
    @Body() dto: UpdatePickingItemDto,
  ) {
    return this.picking.updateItem(id, itemId, organizationId, dto);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.picking.complete(id, organizationId);
  }
}
