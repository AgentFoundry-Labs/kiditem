import { Controller, Get, Post, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async findAll(@Query('companyId') companyId?: string) {
    return this.categoriesService.findAll(await this.companyResolver.resolve());
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.categoriesService.delete(id);
  }
}
