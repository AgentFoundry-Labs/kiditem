import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
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
  findAll(@CurrentOrganization() organizationId: string) {
    return this.warehouses.findAll(organizationId);
  }

  @Post()
  create(@Body() dto: CreateWarehouseDto, @CurrentOrganization() organizationId: string) {
    return this.warehouses.create(organizationId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.warehouses.update(id, organizationId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.warehouses.delete(id, organizationId);
  }
}
