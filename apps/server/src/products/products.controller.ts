import { Controller, Get, Post, Delete, Body, Param, Query, HttpCode, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @Query('grade') grade?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('company') company?: string,
  ) {
    return this.productsService.findAll({ grade, status, search, company });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const product = await this.productsService.findOne(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  @Get(':id/preview')
  async preview(@Param('id') id: string) {
    const product = await this.productsService.findOne(id);
    if (!product) throw new NotFoundException('Product not found');
    const rawData = (product.rawData as Record<string, unknown>) || {};
    return {
      template: product.processedData ? 'bold-vertical' : null,
      data: product.processedData || rawData,
      images: rawData['images'] || [],
    };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: Record<string, unknown>) {
    return this.productsService.create(body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.productsService.remove(id);
    return { ok: true };
  }
}
