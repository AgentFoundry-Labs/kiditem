import { Controller, Get, Post, Body, Query, HttpCode } from '@nestjs/common';
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

  @Post()
  @HttpCode(201)
  create(@Body() body: Record<string, unknown>) {
    return this.productsService.create(body);
  }
}
