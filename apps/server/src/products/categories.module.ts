import { Module } from '@nestjs/common';
import { CategoriesController } from './adapter/in/web/category/categories.controller';
import { CategoriesService } from './application/service/category/categories.service';
import { CoupangCategorySuggestionService } from './application/service/category/coupang-category-suggestion.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, CoupangCategorySuggestionService],
  exports: [CategoriesService, CoupangCategorySuggestionService],
})
export class CategoriesModule {}
