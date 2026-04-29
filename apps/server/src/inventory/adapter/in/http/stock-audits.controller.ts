import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { StockAuditsApplicationService } from '../../../application/service/stock-audits-application.service';
import { CreateStockAuditDto, UpdateStockAuditDto } from './dto';

@Controller('stock-audits')
export class StockAuditsController {
  constructor(private readonly audits: StockAuditsApplicationService) {}

  @Get()
  findAll(@CurrentCompany() companyId: string) {
    return this.audits.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateStockAuditDto, @CurrentCompany() companyId: string) {
    return this.audits.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockAuditDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.audits.update(id, companyId, dto);
  }
}
