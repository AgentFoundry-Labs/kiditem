import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { StockTransfersApplicationService } from '../../../application/service/stock-transfers-application.service';
import {
  CreateStockTransferDto,
  ListStockTransfersQueryDto,
  UpdateStockTransferDto,
} from './dto';

@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersApplicationService) {}

  @Get()
  findAll(@CurrentCompany() companyId: string, @Query() query: ListStockTransfersQueryDto) {
    return this.transfers.findAll(companyId, query);
  }

  @Post()
  create(@Body() dto: CreateStockTransferDto, @CurrentCompany() companyId: string) {
    return this.transfers.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStockTransferDto,
  ) {
    return this.transfers.update(id, dto, companyId);
  }
}
