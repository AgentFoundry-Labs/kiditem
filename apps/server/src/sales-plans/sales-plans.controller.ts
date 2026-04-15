import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { SalesPlansService } from './sales-plans.service';
import { CreateSalesPlanDto, UpdateSalesPlanDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('sales-plans')
export class SalesPlansController {
  constructor(private readonly salesPlansService: SalesPlansService) {}

  @Get()
  async findAll(@CurrentCompany() companyId: string) {
    return this.salesPlansService.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateSalesPlanDto, @CurrentCompany() companyId: string) {
    return this.salesPlansService.create(companyId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSalesPlanDto) {
    return this.salesPlansService.update(id, dto);
  }

  @Patch(':id/sync')
  syncActuals(@Param('id') id: string) {
    return this.salesPlansService.syncActuals(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.salesPlansService.delete(id);
  }
}
