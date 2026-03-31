import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { InventoryService } from '../services/inventory.service';
import { ListInventoryQueryDto, ReceiveStockBodyDto } from '../dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.findAll(query as any);
  }

  @Get('by-product/:productId')
  findByProductId(@Param('productId') productId: string) {
    return this.inventoryService.findByProductId(productId);
  }

  @Patch(':id/receive')
  receive(
    @Param('id') id: string,
    @Body() body: ReceiveStockBodyDto,
  ) {
    return this.inventoryService.receiveStock(id, body.quantity);
  }
}
