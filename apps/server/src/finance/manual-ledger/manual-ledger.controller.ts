import { Controller, Get, Post, Delete, Param, Query, Body } from '@nestjs/common';
import { ManualLedgerService } from './manual-ledger.service';
import { ListManualLedgerQueryDto, CreateManualLedgerDto } from './dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('manual-ledger')
export class ManualLedgerController {
  constructor(private readonly manualLedgerService: ManualLedgerService) {}

  @Get()
  async findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListManualLedgerQueryDto,
  ) {
    return this.manualLedgerService.findAll(organizationId, query.type, query.period);
  }

  @Post()
  create(@Body() dto: CreateManualLedgerDto, @CurrentOrganization() organizationId: string) {
    return this.manualLedgerService.create(organizationId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.manualLedgerService.delete(id, organizationId);
  }
}
