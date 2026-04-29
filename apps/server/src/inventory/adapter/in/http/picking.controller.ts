import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { PickingApplicationService } from '../../../application/service/picking-application.service';
import { UpdatePickingItemDto } from './dto';

@Controller('picking')
export class PickingController {
  constructor(private readonly picking: PickingApplicationService) {}

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
