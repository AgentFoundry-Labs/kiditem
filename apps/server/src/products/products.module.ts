import { Module } from '@nestjs/common';
import { ProductOperationsController } from './adapter/in/http/product-operations.controller';
import { ProductOperationsRepositoryAdapter } from './adapter/out/repository/product-operations.repository.adapter';
import { PRODUCT_OPERATIONS_REPOSITORY_PORT } from './application/port/out/repository/product-operations.repository.port';
import { ProductOperationsService } from './application/service/product-operations.service';
import { ProductVariantRecipeService } from './application/service/product-variant-recipe.service';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [CategoriesModule],
  controllers: [ProductOperationsController],
  providers: [
    ProductOperationsService,
    ProductVariantRecipeService,
    ProductOperationsRepositoryAdapter,
    {
      provide: PRODUCT_OPERATIONS_REPOSITORY_PORT,
      useExisting: ProductOperationsRepositoryAdapter,
    },
  ],
  exports: [ProductOperationsService, ProductVariantRecipeService],
})
export class ProductsModule {}
