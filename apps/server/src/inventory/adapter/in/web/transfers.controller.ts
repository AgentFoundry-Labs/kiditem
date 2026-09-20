import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  TRANSFERS_PORT,
  type TransfersPort,
} from '../../../application/port/in/warehouse/transfers.port';
import {
  CreateStockTransferDto,
  ListStockTransfersQueryDto,
} from './dto';

// Route stays `/api/stock-transfers/*` even though the file is now
// `transfers.controller.ts` — capability owns route shape (Phase 3B contract).
@Controller('stock-transfers')
export class TransfersController {
  constructor(
    @Inject(TRANSFERS_PORT) private readonly transfers: TransfersPort,
  ) {}

  @Get()
  findAll(@CurrentOrganization() organizationId: string, @Query() query: ListStockTransfersQueryDto) {
    return this.transfers.findAll(organizationId, query);
  }

  @Post()
  create(@Body() dto: CreateStockTransferDto, @CurrentOrganization() organizationId: string) {
    return this.transfers.create(organizationId, dto);
  }

}
