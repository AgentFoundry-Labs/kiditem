import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import {
  PICKING_PORT,
  type PickingPort,
} from '../../../application/port/in/picking.port';
import { UpdatePickingItemDto } from './dto';

@Controller('picking')
export class PickingController {
  constructor(
    @Inject(PICKING_PORT) private readonly picking: PickingPort,
  ) {}

  @Get()
  findAll(@CurrentCompany() companyId: string) {
    return this.picking.findAll(companyId);
  }

  @Post('generate')
  generate(@CurrentCompany() companyId: string) {
    return this.picking.generate(companyId);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdatePickingItemDto,
  ) {
    return this.picking.updateItem(id, itemId, companyId, dto);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.picking.complete(id, companyId);
  }
}
