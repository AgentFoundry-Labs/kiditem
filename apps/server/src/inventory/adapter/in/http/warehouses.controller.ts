import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import {
  WAREHOUSES_PORT,
  type WarehousesPort,
} from '../../../application/port/in/warehouses.port';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto';

@Controller('warehouses')
export class WarehousesController {
  constructor(
    @Inject(WAREHOUSES_PORT) private readonly warehouses: WarehousesPort,
  ) {}

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
