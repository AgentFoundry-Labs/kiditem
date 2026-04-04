import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { ListStockTransfersQueryDto, CreateStockTransferDto, UpdateStockTransferDto } from './dto';

@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly stockTransfersService: StockTransfersService) {}

  @Get()
  findAll(@Query() query: ListStockTransfersQueryDto) {
    return this.stockTransfersService.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateStockTransferDto) {
    return this.stockTransfersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStockTransferDto) {
    return this.stockTransfersService.update(id, dto);
  }
}
