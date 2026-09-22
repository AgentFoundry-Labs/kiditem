import { AiListingContentQueryModule } from '../content/ai-listing-content-query.module';
import { ListingContentAdapter } from './adapter/out/content/listing-content.adapter';
import { CHANNEL_LISTING_CONTENT_PORT, type ChannelListingContentPort } from './application/port/out/content/listing-content.port';
import { CatalogIdentityService } from './application/service/collection/catalog-identity.service';
import { CatalogIdentityPersistenceAdapter } from './adapter/out/persistence/catalog-identity.persistence.adapter';
import { CHANNEL_CATALOG_IDENTITY_PORT } from './application/port/in/collection/catalog-identity.port';
import { CHANNEL_CATALOG_IDENTITY_PERSISTENCE_PORT, type ChannelCatalogIdentityPersistencePort } from './application/port/out/persistence/catalog-identity.persistence.port';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { CHANNEL_ACCOUNT_PORT } from './application/port/in/account/channel-account.port';
import { CHANNEL_ACCOUNT_PERSISTENCE_PORT, type ChannelAccountPersistencePort } from './application/port/out/persistence/channel-account.persistence.port';
import { CHANNEL_CREDENTIALS_PORT, type ChannelCredentialsPort } from './application/port/out/credentials/channel-credentials.port';
import { ChannelAccountService } from './application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from './adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from './adapter/out/credentials/channel-credentials.adapter';
import { CHANNEL_LISTING_QUERY_PORT } from './application/port/in/listing/channel-listing-query.port';
import { CHANNEL_LISTING_REPORT_READ_PORT } from './application/port/in/channel-listing-report-read.port';
import { CHANNEL_LISTING_QUERY_PERSISTENCE_PORT, type ChannelListingQueryPersistencePort } from './application/port/out/persistence/channel-listing-query.persistence.port';
import { ChannelListingQueryService } from './application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from './adapter/out/persistence/channel-listing-query.persistence.adapter';
import { CHANNEL_OPTION_RECIPE_PORT } from './application/port/in/channel-option-recipe.port';
import { CHANNEL_OPTION_RECIPE_REPOSITORY_PORT, type ChannelOptionRecipeRepositoryPort } from './application/port/out/persistence/channel-option-recipe.repository.port';
import { ChannelOptionRecipeRepositoryAdapter } from './adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from './application/service/listing/channel-option-recipe.service';

/**
 * Catalog identity capabilities can be consumed without starting provider or AI execution.
 *
 * 예전 channel-option-recipe.module.ts(레시피 변경 seam)를 합쳤다 — Products 를 포함해
 * 이미 이 모듈을 함께 가져오는 소비자가 여럿이었다.
 */
@Module({
  imports: [AiListingContentQueryModule, PrismaModule, ProductCollectionRuntimeModule],
  providers: [
    ListingContentAdapter,
    { provide: CHANNEL_LISTING_CONTENT_PORT, useExisting: ListingContentAdapter },
    CatalogIdentityPersistenceAdapter,
    { provide: CHANNEL_CATALOG_IDENTITY_PERSISTENCE_PORT, useExisting: CatalogIdentityPersistenceAdapter },
    { provide: CatalogIdentityService, useFactory: (persistence: ChannelCatalogIdentityPersistencePort) => new CatalogIdentityService(persistence), inject: [CHANNEL_CATALOG_IDENTITY_PERSISTENCE_PORT] },
    { provide: CHANNEL_CATALOG_IDENTITY_PORT, useExisting: CatalogIdentityService },
    ChannelAccountPersistenceAdapter,
    { provide: CHANNEL_ACCOUNT_PERSISTENCE_PORT, useExisting: ChannelAccountPersistenceAdapter },
    ChannelCredentialsAdapter,
    { provide: CHANNEL_CREDENTIALS_PORT, useExisting: ChannelCredentialsAdapter },
    { provide: ChannelAccountService, useFactory: (persistence: ChannelAccountPersistencePort, credentials: ChannelCredentialsPort) => new ChannelAccountService(persistence, credentials), inject: [CHANNEL_ACCOUNT_PERSISTENCE_PORT, CHANNEL_CREDENTIALS_PORT] },
    { provide: CHANNEL_ACCOUNT_PORT, useExisting: ChannelAccountService },
    ChannelListingQueryPersistenceAdapter,
    { provide: CHANNEL_LISTING_QUERY_PERSISTENCE_PORT, useExisting: ChannelListingQueryPersistenceAdapter },
    { provide: ChannelListingQueryService, useFactory: (persistence: ChannelListingQueryPersistencePort, content: ChannelListingContentPort) => new ChannelListingQueryService(persistence, content), inject: [CHANNEL_LISTING_QUERY_PERSISTENCE_PORT, CHANNEL_LISTING_CONTENT_PORT] },
    { provide: CHANNEL_LISTING_QUERY_PORT, useExisting: ChannelListingQueryService },
    { provide: CHANNEL_LISTING_REPORT_READ_PORT, useExisting: ChannelListingQueryService },
    // 예전 channel-option-recipe.module.ts. Consumers import this module without
    // pulling in Products' analytics and Finance dependencies. Product identity
    // validation goes through the transaction-aware Products read port.
    ChannelOptionRecipeRepositoryAdapter,
    {
      provide: CHANNEL_OPTION_RECIPE_REPOSITORY_PORT,
      useExisting: ChannelOptionRecipeRepositoryAdapter,
    },
    { provide: ChannelOptionRecipeService, useFactory: (persistence: ChannelOptionRecipeRepositoryPort) => new ChannelOptionRecipeService(persistence), inject: [CHANNEL_OPTION_RECIPE_REPOSITORY_PORT] },
    {
      provide: CHANNEL_OPTION_RECIPE_PORT,
      useExisting: ChannelOptionRecipeService,
    },
  ],
  exports: [CHANNEL_CATALOG_IDENTITY_PORT, CHANNEL_ACCOUNT_PORT, CHANNEL_LISTING_QUERY_PORT, CHANNEL_LISTING_REPORT_READ_PORT, CHANNEL_OPTION_RECIPE_PORT],
})
export class ChannelCatalogModule {}
