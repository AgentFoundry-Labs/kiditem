import { Controller, Get, Post, Delete, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { BundleProductsService } from './bundle-products.service';
import { AnalyzeBundleQueryDto, CreateBundleProductDto } from './dto';

@Controller('bundle-products')
export class BundleProductsController {
  constructor(
    private readonly bundleProductsService: BundleProductsService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get('analyze')
  async analyze(@Query() query: AnalyzeBundleQueryDto) {
    return this.bundleProductsService.analyze(
      await this.companyResolver.resolve(),
    );
  }

  @Post()
  create(@Body() dto: CreateBundleProductDto) {
    return this.bundleProductsService.create(dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.bundleProductsService.delete(id);
  }
}
