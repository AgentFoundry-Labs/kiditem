import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { WarehousesApplicationService } from '../../../application/service/warehouses-application.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesApplicationService) {}

  @Get()
  findAll(@CurrentCompany() companyId: string) {
    return this.warehouses.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateWarehouseDto, @CurrentCompany() companyId: string) {
    return this.warehouses.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.warehouses.update(id, companyId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.warehouses.delete(id, companyId);
  }
}
