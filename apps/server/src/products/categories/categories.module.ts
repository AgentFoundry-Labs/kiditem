import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CoupangCategorySuggestionService } from './coupang-category-suggestion.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, CoupangCategorySuggestionService],
  exports: [CategoriesService, CoupangCategorySuggestionService],
})
export class CategoriesModule {}
