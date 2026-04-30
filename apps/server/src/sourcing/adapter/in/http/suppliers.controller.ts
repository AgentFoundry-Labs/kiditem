import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { SuppliersService } from '../../../application/service/suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async findAll(@CurrentCompany() companyId: string) {
    return this.suppliersService.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto, @CurrentCompany() companyId: string) {
    return this.suppliersService.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.suppliersService.update(id, companyId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.suppliersService.delete(id, companyId);
  }
}
