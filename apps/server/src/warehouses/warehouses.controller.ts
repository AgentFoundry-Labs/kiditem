import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  async findAll(@CurrentCompany() companyId: string) {
    return this.warehousesService.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateWarehouseDto, @CurrentCompany() companyId: string) {
    return this.warehousesService.create(companyId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.warehousesService.delete(id);
  }
}
