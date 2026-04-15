import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { PickingService } from './picking.service';
import { UpdatePickingItemDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('picking')
export class PickingController {
  constructor(private readonly pickingService: PickingService) {}

  @Get()
  async findAll(@CurrentCompany() companyId: string) {
    return this.pickingService.findAll(companyId);
  }

  @Post('generate')
  generate(@CurrentCompany() companyId: string) {
    return this.pickingService.generate(companyId);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePickingItemDto,
  ) {
    return this.pickingService.updateItem(id, itemId, dto);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string) {
    return this.pickingService.complete(id);
  }
}
