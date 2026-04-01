import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, NotFoundException } from '@nestjs/common';
import { ProductsService } from '../services/products.service';
import {
  ListProductsQueryDto,
  PipelineStatsQueryDto,
  CreateProductBodyDto,
  type UpdateDraftContentBody,
  TriggerContentDraftBodyDto,
} from '../dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query as any);
  }

  @Get('pipeline-stats')
  getPipelineStats(@Query() query: PipelineStatsQueryDto) {
    return this.productsService.getPipelineStats(query.status);
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
    @Body() body: TriggerContentDraftBodyDto,
  ) {
    return this.productsService.triggerContentDraft(id, body);
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CreateProductBodyDto) {
    return this.productsService.create(body as any);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.productsService.remove(id);
    return { ok: true };
  }
}
