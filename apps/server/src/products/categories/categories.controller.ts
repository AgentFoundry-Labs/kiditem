import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll(@CurrentOrganization() organizationId: string) {
    return this.categoriesService.findAll(organizationId);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentOrganization() organizationId: string) {
    return this.categoriesService.create(organizationId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.categoriesService.update(id, organizationId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.categoriesService.delete(id, organizationId);
  }
}
