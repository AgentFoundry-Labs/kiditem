import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, NotFoundException } from '@nestjs/common';
import { ProductsService } from '../services/products.service';
import { ThumbnailAiService } from '../services/thumbnail-ai.service';
import {
  ListProductsQueryDto,
  PipelineStatsQueryDto,
  CreateProductBodyDto,
  UpdateDraftContentBodyDto,
  TriggerContentDraftBodyDto,
  UpdateProductImagesDto,
} from '../dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly thumbnailAiService: ThumbnailAiService,
  ) {}

  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('pipeline-stats')
  getPipelineStats(@Query() query: PipelineStatsQueryDto) {
    return this.productsService.getPipelineStats(query.status);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Get(':id/preview')
  async preview(@Param('id') id: string) {
    return this.productsService.getPreview(id);
  }

  @Get(':id/original-image-base64')
  async getOriginalImageBase64(@Param('id') id: string) {
    const product = await this.productsService.findOne(id);
    if (!product.imageUrl) {
      throw new NotFoundException('상품에 원본 이미지가 없습니다');
    }
    const { data, mimeType } = await this.thumbnailAiService.fetchImageAsBase64Public(product.imageUrl);
    return { dataUrl: `data:${mimeType};base64,${data}` };
  }

  @Put(':id/draft-content')
  async updateDraftContent(
    @Param('id') id: string,
    @Body() body: UpdateDraftContentBodyDto,
  ) {
    return this.productsService.updateDraftContent(id, body.draftContent);
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
  create(@Body() body: CreateProductBodyDto, @CurrentCompany() companyId: string) {
    return this.productsService.create({ ...body, companyId });
  }

  @Patch(':id/images')
  async updateImages(
    @Param('id') id: string,
    @Body() body: UpdateProductImagesDto,
  ) {
    return this.productsService.updateImages(id, body.images);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.productsService.remove(id);
    return { ok: true };
  }
}
