import { Controller, Get, Post, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto';

@Controller('warehouses')
export class WarehousesController {
  constructor(
    private readonly warehousesService: WarehousesService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async findAll(@Query('companyId') companyId?: string) {
    return this.warehousesService.findAll(await this.companyResolver.resolve());
  }

  @Post()
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
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
