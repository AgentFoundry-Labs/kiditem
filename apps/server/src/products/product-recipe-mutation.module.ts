import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductChannelOptionRecipeMutationRepositoryAdapter } from './adapter/out/repository/product-channel-option-recipe-mutation.repository.adapter';
import { PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT } from './application/port/in/product-channel-option-recipe-mutation.port';
import { PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_REPOSITORY_PORT } from './application/port/out/repository/product-channel-option-recipe-mutation.repository.port';
import { ProductChannelOptionRecipeMutationService } from './application/service/product-channel-option-recipe-mutation.service';

/**
 * Products' focused recipe mutation seam. Consumers import this module without
 * pulling in Products' analytics and Finance dependencies.
 */
@Module({
  imports: [InventoryModule],
  providers: [
    ProductChannelOptionRecipeMutationRepositoryAdapter,
    {
      provide: PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_REPOSITORY_PORT,
      useExisting: ProductChannelOptionRecipeMutationRepositoryAdapter,
    },
    ProductChannelOptionRecipeMutationService,
    {
      provide: PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT,
      useExisting: ProductChannelOptionRecipeMutationService,
    },
  ],
  exports: [PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT],
})
export class ProductRecipeMutationModule {}
