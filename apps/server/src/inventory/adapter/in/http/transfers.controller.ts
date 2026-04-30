import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import {
  TRANSFERS_PORT,
  type TransfersPort,
} from '../../../application/port/in/transfers.port';
import {
  CreateStockTransferDto,
  ListStockTransfersQueryDto,
  UpdateStockTransferDto,
} from './dto';

// Route stays `/api/stock-transfers/*` even though the file is now
// `transfers.controller.ts` — capability owns route shape (Phase 3B contract).
@Controller('stock-transfers')
export class TransfersController {
  constructor(
    @Inject(TRANSFERS_PORT) private readonly transfers: TransfersPort,
  ) {}

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
