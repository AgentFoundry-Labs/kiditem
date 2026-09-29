import { AI_LISTING_CONTENT_QUERY_PORT } from '../content/application/port/in/workspace/listing-content-query.port';
import { ListingContentQueryRepositoryAdapter } from '../content/adapter/out/persistence/listing-content-query.repository';
import { CHANNEL_LISTING_QUERY_PORT } from '../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_OPTION_RECIPE_PORT } from '../channels/application/port/in/channel-option-recipe.port';
import { CHANNEL_ACCOUNT_PORT } from '../channels/application/port/in/account/channel-account.port';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelListingQueryPersistenceAdapter } from '../channels/adapter/out/persistence/channel-listing-query.repository';
import { ChannelListingQueryService } from '../channels/application/service/listing/channel-listing-query.service';
import { ChannelOptionRecipeRepositoryAdapter } from '../channels/adapter/out/persistence/channel-option-recipe.repository';
import { ChannelOptionRecipeService } from '../channels/application/service/listing/channel-option-recipe.service';
import { ChannelAccountPersistenceAdapter } from '../channels/adapter/out/persistence/channel-account.repository';
import { ChannelAccountService } from '../channels/application/service/account/channel-account.service';
import { ProductTransactionalReadRepositoryAdapter } from '../products/adapter/out/persistence/product-transactional-read.repository';
import { ChannelsProductMappingGenerationAdapter } from '../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../products/adapter/out/persistence/product-mapping-generation.repository';
import { ADVERTISING_LEDGER_READ_PORT } from '../advertising/application/port/in/ledger/advertising-ledger-read.port';
import { AdvertisingLedgerReadService } from '../advertising/application/service/advertising-ledger-read.service';
import { AdLedgerReadPersistenceAdapter } from '../advertising/adapter/out/persistence/ad-ledger-read.repository';
import { AdLedgerMonthlyAllocationPersistenceAdapter } from '../advertising/adapter/out/persistence/ad-ledger-monthly-allocation.repository';
import { ORDER_FACTS_PORT } from '../orders/application/port/in/facts/order-facts.port';
import { REVIEW_FACTS_PORT } from '../orders/application/port/in/facts/review-facts.port';
import { OrderFactsRepository } from '../orders/adapter/out/persistence/order-facts.repository';
import { ReviewFactsRepository } from '../orders/adapter/out/persistence/review-facts.repository';

/** Compose real owner fact capabilities for adapter/PG tests using one database client. */
export function channelFactTestPorts(prisma: PrismaService) {
  const productMapping = new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter());
  return {
    listings: new ChannelListingQueryService(new ChannelListingQueryPersistenceAdapter(prisma), {
      findForListings: async () => { throw new Error("Content projections are not part of fact reads"); },
    }, {
      readForSalesProducts: async () => { throw new Error('Registration state is not part of fact reads'); },
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
  { provide: ADVERTISING_LEDGER_READ_PORT, inject: [PrismaService], useFactory: (prisma: PrismaService) => advertisingLedgerTestReader(prisma) },
  { provide: ORDER_FACTS_PORT, inject: [PrismaService], useFactory: (prisma: PrismaService) => orderFactsTestReader(prisma) },
  { provide: REVIEW_FACTS_PORT, useFactory: () => reviewFactsTestReader() },
];

/** Orders 주문 사실 incoming port(KID-392) — 실제 계정 capability와 실제 Orders 어댑터로 조립한다. */
export function orderFactsTestReader(prisma: PrismaService) {
  return new OrderFactsRepository(channelFactTestPorts(prisma).accounts);
}

/** 광고 원장 읽기 capability(KID-372) — 실제 계정 capability와 실제 원장 어댑터로 조립한다. */
export function advertisingLedgerTestReader(prisma: PrismaService) {
  const ports = channelFactTestPorts(prisma);
  return new AdvertisingLedgerReadService(
    ports.accounts,
    new AdLedgerReadPersistenceAdapter(),
    ports.recipes,
    new AdLedgerMonthlyAllocationPersistenceAdapter(),
  );
}

export function profitCatalogTestReaders(prisma: PrismaService) {
  return {
    ...channelFactTestPorts(prisma),
    content: new ListingContentQueryRepositoryAdapter(prisma),
    ads: advertisingLedgerTestReader(prisma),
  };
}

/** Orders 리뷰 사실 incoming port(KID-392) — 실제 Orders 어댑터. */
export function reviewFactsTestReader() {
  return new ReviewFactsRepository();
}
