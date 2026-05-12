import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { SuppliersService } from '../../../application/service/suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async findAll(@CurrentOrganization() organizationId: string) {
    return this.suppliersService.findAll(organizationId);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto, @CurrentOrganization() organizationId: string) {
    return this.suppliersService.create(organizationId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.suppliersService.update(id, organizationId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.suppliersService.delete(id, organizationId);
  }
}
