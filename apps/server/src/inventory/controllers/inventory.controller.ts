import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { InventoryService } from '../services/inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.inventoryService.findAll({ page, limit, status });
  }

  @Get('by-product/:productId')
  findByProductId(@Param('productId') productId: string) {
    return this.inventoryService.findByProductId(productId);
  }

  @Patch(':id/receive')
  receive(
    @Param('id') id: string,
    @Body() body: { quantity: number },
  ) {
    return this.inventoryService.receiveStock(id, body.quantity);
  }
}
