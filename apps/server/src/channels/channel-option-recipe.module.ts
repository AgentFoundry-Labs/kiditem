import { Module } from '@nestjs/common';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { ChannelOptionRecipeRepositoryAdapter } from './adapter/out/persistence/channel-option-recipe.repository.adapter';
import { CHANNEL_OPTION_RECIPE_PORT } from './application/port/in/channel-option-recipe.port';
import { CHANNEL_OPTION_RECIPE_REPOSITORY_PORT } from './application/port/out/persistence/channel-option-recipe.repository.port';
import { ChannelOptionRecipeUseCase } from './application/usecase/channel-option-recipe.usecase';

/**
 * Channels' focused recipe mutation seam. Consumers import this module without
 * pulling in Products' analytics and Finance dependencies. Product identity
 * validation goes through the transaction-aware Products read port.
 */
@Module({
  imports: [ProductCollectionRuntimeModule],
  providers: [
    ChannelOptionRecipeRepositoryAdapter,
    {
      provide: CHANNEL_OPTION_RECIPE_REPOSITORY_PORT,
      useExisting: ChannelOptionRecipeRepositoryAdapter,
    },
    ChannelOptionRecipeUseCase,
    {
      provide: CHANNEL_OPTION_RECIPE_PORT,
      useExisting: ChannelOptionRecipeUseCase,
    },
  ],
  exports: [CHANNEL_OPTION_RECIPE_PORT],
})
export class ChannelOptionRecipeModule {}
