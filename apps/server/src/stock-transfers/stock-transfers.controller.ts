import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { ListStockTransfersQueryDto, CreateStockTransferDto, UpdateStockTransferDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly stockTransfersService: StockTransfersService) {}

  @Get()
  findAll(@CurrentCompany() companyId: string, @Query() query: ListStockTransfersQueryDto) {
    return this.stockTransfersService.findAll(companyId, query);
  }

  @Post()
  create(@Body() dto: CreateStockTransferDto, @CurrentCompany() companyId: string) {
    return this.stockTransfersService.create(companyId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStockTransferDto) {
    return this.stockTransfersService.update(id, dto);
  }
}
