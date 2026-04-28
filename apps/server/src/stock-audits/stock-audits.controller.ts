import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { StockAuditsService } from './stock-audits.service';
import { CreateStockAuditDto, UpdateStockAuditDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('stock-audits')
export class StockAuditsController {
  constructor(private readonly stockAuditsService: StockAuditsService) {}

  @Get()
  findAll(@CurrentCompany() companyId: string) {
    return this.stockAuditsService.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateStockAuditDto, @CurrentCompany() companyId: string) {
    return this.stockAuditsService.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockAuditDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.stockAuditsService.update(id, dto, companyId);
  }
}
