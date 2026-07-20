import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import {
  CoupangCategorySuggestionRequestSchema,
  type CoupangCategorySuggestionResponse,
} from '@kiditem/shared/coupang-category';
import { CategoriesService } from './categories.service';
import { CoupangCategorySuggestionService } from './coupang-category-suggestion.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly coupangSuggestions: CoupangCategorySuggestionService,
  ) {}

  /**
   * 상품명들에 대한 쿠팡 카테고리 제안. 확신이 없으면 `suggestion: null` 로 내려간다 —
   * 호출부는 이때 하드코딩 카테고리로 대체하지 말고 수동 선택을 요구해야 한다.
   */
  @Post('coupang-suggestions')
  async suggestCoupangCategories(
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
  ): Promise<CoupangCategorySuggestionResponse> {
    const { names } = CoupangCategorySuggestionRequestSchema.parse(body);
    return this.coupangSuggestions.suggest(organizationId, names);
  }

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
