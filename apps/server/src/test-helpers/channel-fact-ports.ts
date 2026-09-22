import { AI_LISTING_CONTENT_QUERY_PORT } from '../content/application/port/in/workspace/listing-content-query.port';
import { ListingContentQueryRepositoryAdapter } from '../content/adapter/out/repository/listing-content-query.repository.adapter';
import { CHANNEL_LISTING_QUERY_PORT } from '../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_OPTION_RECIPE_PORT } from '../channels/application/port/in/channel-option-recipe.port';
import { CHANNEL_ACCOUNT_PORT } from '../channels/application/port/in/account/channel-account.port';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelListingQueryPersistenceAdapter } from '../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ChannelListingQueryService } from '../channels/application/service/listing/channel-listing-query.service';
import { ChannelOptionRecipeRepositoryAdapter } from '../channels/adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from '../channels/application/service/listing/channel-option-recipe.service';
import { ChannelAccountPersistenceAdapter } from '../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelAccountService } from '../channels/application/service/account/channel-account.service';
import { ProductTransactionalReadRepositoryAdapter } from '../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../products/adapter/out/persistence/product-mapping-generation.repository.adapter';

/** Compose real owner fact capabilities for adapter/PG tests using one database client. */
export function channelFactTestPorts(prisma: PrismaService) {
  const productMapping = new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter());
  return {
    listings: new ChannelListingQueryService(new ChannelListingQueryPersistenceAdapter(prisma), {
      findForListings: async () => { throw new Error("Content projections are not part of fact reads"); },
    }),
    recipes: new ChannelOptionRecipeService(new ChannelOptionRecipeRepositoryAdapter(prisma, new ProductTransactionalReadRepositoryAdapter(), productMapping)),
    accounts: new ChannelAccountService(new ChannelAccountPersistenceAdapter(prisma, productMapping), {
      isEncrypted: () => false,
      encrypt: () => { throw new Error('Credentials are not part of fact reads'); },
      decrypt: () => { throw new Error('Credentials are not part of fact reads'); },
    }),
  };
}

/** Supply the same real capabilities when a focused test assembles Nest providers. */
export const channelFactTestProviders = [
  { provide: AI_LISTING_CONTENT_QUERY_PORT, inject: [PrismaService], useFactory: (prisma: PrismaService) => new ListingContentQueryRepositoryAdapter(prisma) },
  { provide: CHANNEL_LISTING_QUERY_PORT, inject: [PrismaService], useFactory: (prisma: PrismaService) => channelFactTestPorts(prisma).listings },
  { provide: CHANNEL_OPTION_RECIPE_PORT, inject: [PrismaService], useFactory: (prisma: PrismaService) => channelFactTestPorts(prisma).recipes },
  { provide: CHANNEL_ACCOUNT_PORT, inject: [PrismaService], useFactory: (prisma: PrismaService) => channelFactTestPorts(prisma).accounts },
];

export function profitCatalogTestReaders(prisma: PrismaService) {
  return { ...channelFactTestPorts(prisma), content: new ListingContentQueryRepositoryAdapter(prisma) };
}
