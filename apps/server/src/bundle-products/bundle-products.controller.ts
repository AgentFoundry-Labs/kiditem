import { Controller, Get, Post, Delete, Param, Query, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BundleProductsService } from './bundle-products.service';
import { AnalyzeBundleQueryDto, CreateBundleProductDto } from './dto';

@Controller('bundle-products')
export class BundleProductsController {
  constructor(
    private readonly bundleProductsService: BundleProductsService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get('analyze')
  async analyze(@Query() query: AnalyzeBundleQueryDto) {
    return this.bundleProductsService.analyze(
      await this.resolveCompanyId(query.companyId),
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
