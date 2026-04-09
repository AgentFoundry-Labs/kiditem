import { Controller, Get, Post, Delete, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { ManualLedgerService } from './manual-ledger.service';
import { ListManualLedgerQueryDto, CreateManualLedgerDto } from './dto';

@Controller('manual-ledger')
export class ManualLedgerController {
  constructor(
    private readonly manualLedgerService: ManualLedgerService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async findAll(@Query() query: ListManualLedgerQueryDto) {
    return this.manualLedgerService.findAll(
      await this.companyResolver.resolve(),
      query.type,
      query.period,
    );
  }

  @Post()
  create(@Body() dto: CreateManualLedgerDto) {
    return this.manualLedgerService.create(dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.manualLedgerService.delete(id);
  }
}
