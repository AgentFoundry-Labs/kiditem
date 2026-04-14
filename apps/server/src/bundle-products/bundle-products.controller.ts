import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { BundleProductsService } from './bundle-products.service';
import { CreateBundleProductDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('bundle-products')
export class BundleProductsController {
  constructor(private readonly bundleProductsService: BundleProductsService) {}

  @Get('analyze')
  async analyze(@CurrentCompany() companyId: string) {
    return this.bundleProductsService.analyze(companyId);
  }

  @Post()
  create(@Body() dto: CreateBundleProductDto, @CurrentCompany() companyId: string) {
    return this.bundleProductsService.create(companyId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.bundleProductsService.delete(id);
  }
}
