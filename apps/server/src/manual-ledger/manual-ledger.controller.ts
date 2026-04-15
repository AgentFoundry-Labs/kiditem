import { Controller, Get, Post, Delete, Param, Query, Body } from '@nestjs/common';
import { ManualLedgerService } from './manual-ledger.service';
import { ListManualLedgerQueryDto, CreateManualLedgerDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('manual-ledger')
export class ManualLedgerController {
  constructor(private readonly manualLedgerService: ManualLedgerService) {}

  @Get()
  async findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ListManualLedgerQueryDto,
  ) {
    return this.manualLedgerService.findAll(companyId, query.type, query.period);
  }

  @Post()
  create(@Body() dto: CreateManualLedgerDto, @CurrentCompany() companyId: string) {
    return this.manualLedgerService.create(companyId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.manualLedgerService.delete(id);
  }
}
