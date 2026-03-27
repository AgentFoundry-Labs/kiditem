import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, NotFoundException } from '@nestjs/common';
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
    return this.productsService.getPreview(id);
  }

  @Put(':id/draft-content')
  async updateDraftContent(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.productsService.updateDraftContent(id, body);
  }

  @Post(':id/trigger-image-generation')
  async triggerImageGeneration(@Param('id') id: string) {
    return this.productsService.triggerImageGeneration(id);
  }

  @Post(':id/trigger-content-draft')
  async triggerContentDraft(
    @Param('id') id: string,
    @Body() body: { seed_hook_text?: string; seed_hook_title_sub?: string; seed_hero_image?: string },
  ) {
    return this.productsService.triggerContentDraft(id, body);
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
