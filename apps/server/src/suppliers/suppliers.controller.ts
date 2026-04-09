import { Controller, Get, Post, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { SuppliersService } from './suppliers.service';
import { ListSuppliersQueryDto, CreateSupplierDto, UpdateSupplierDto } from './dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async findAll(@Query() query: ListSuppliersQueryDto) {
    return this.suppliersService.findAll(
      await this.companyResolver.resolve(),
    );
  }

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.suppliersService.delete(id);
  }
}
