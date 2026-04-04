import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { ProductMemosService } from './product-memos.service';
import { ListProductMemosQueryDto, CreateProductMemoDto, UpdateProductMemoDto } from './dto';

@Controller('product-memos')
export class ProductMemosController {
  constructor(private readonly productMemosService: ProductMemosService) {}

  @Get()
  findAll(@Query() query: ListProductMemosQueryDto) {
    return this.productMemosService.findAll(query.productId);
  }

  @Post()
  create(@Body() dto: CreateProductMemoDto) {
    return this.productMemosService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductMemoDto) {
    return this.productMemosService.update(id, dto);
  }
}
