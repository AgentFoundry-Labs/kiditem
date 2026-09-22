import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ChannelListingQueryService } from '../channels/application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from '../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ListingContentQueryRepositoryAdapter } from '../content/adapter/out/repository/listing-content-query.repository.adapter';
import { ChannelOptionRecipeService } from '../channels/application/service/listing/channel-option-recipe.service';
import { ChannelOptionRecipeRepositoryAdapter } from '../channels/adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../products/adapter/out/persistence/product-mapping-generation.repository.adapter';

export function makeChannelListingQuery(prisma: PrismaClient) {
  return new ChannelListingQueryService(new ChannelListingQueryPersistenceAdapter(prisma as PrismaService), new ListingContentQueryRepositoryAdapter(prisma as PrismaService));
}
export function makeChannelRecipes(prisma: PrismaClient) {
  return new ChannelOptionRecipeService(new ChannelOptionRecipeRepositoryAdapter(
    prisma as PrismaService,
    new ProductTransactionalReadRepositoryAdapter(),
    new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
  ));
}
