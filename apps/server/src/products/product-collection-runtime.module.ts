import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductAvailabilityRepositoryAdapter } from './adapter/out/persistence/product-availability.repository.adapter';
import { ProductSourceReadRepositoryAdapter } from './adapter/out/persistence/product-source-read.repository.adapter';
import { ProductCollectionFreshnessRepositoryAdapter } from './adapter/out/persistence/product-source-freshness.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from './adapter/out/persistence/product-transactional-read.repository.adapter';
import { ProductMappingGenerationRepositoryAdapter } from './adapter/out/persistence/product-mapping-generation.repository.adapter';
import {
  PRODUCT_AVAILABILITY_PORT,
} from './application/port/in/product-availability.port';
import {
  PRODUCT_COLLECTION_FRESHNESS_GATE_PORT,
} from './application/port/in/product-collection-freshness-gate.port';
import { SELLPIA_SOURCE_ACCOUNT_PORT } from './application/port/in/sellpia-source-account.port';
import { PRODUCT_SOURCE_READ_PORT } from './application/port/in/product-source-read.port';
import { PRODUCT_TRANSACTIONAL_READ_PORT } from './application/port/in/product-transactional-read.port';
import { PRODUCT_MAPPING_GENERATION_PORT } from './application/port/in/product-mapping-generation.port';
import {
  PRODUCT_AVAILABILITY_REPOSITORY_PORT,
} from './application/port/out/persistence/product-availability.repository.port';
import {
  PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT,
} from './application/port/out/persistence/product-source-freshness.repository.port';
import {
  PRODUCT_SOURCE_READ_REPOSITORY_PORT,
} from './application/port/out/persistence/product-source-read.repository.port';
import { ProductAvailabilityUseCase } from './application/usecase/product-availability.usecase';
import { ProductCollectionFreshnessUseCase } from './application/usecase/product-collection-freshness.usecase';
import { ProductSourceReadUseCase } from './application/usecase/product-source-read.usecase';

/**
 * Internal Products assembly for transaction-aware source reads. Keeping this
 * module separate lets ProductsModule consume the public ports without a
 * source collection/runtime cycle.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    ProductAvailabilityRepositoryAdapter,
    ProductCollectionFreshnessRepositoryAdapter,
    ProductSourceReadRepositoryAdapter,
    ProductTransactionalReadRepositoryAdapter,
    ProductMappingGenerationRepositoryAdapter,
    ProductAvailabilityUseCase,
    ProductCollectionFreshnessUseCase,
    ProductSourceReadUseCase,
    {
      provide: PRODUCT_AVAILABILITY_REPOSITORY_PORT,
      useExisting: ProductAvailabilityRepositoryAdapter,
    },
    {
      provide: PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT,
      useExisting: ProductCollectionFreshnessRepositoryAdapter,
    },
    {
      provide: PRODUCT_SOURCE_READ_REPOSITORY_PORT,
      useExisting: ProductSourceReadRepositoryAdapter,
    },
    {
      provide: PRODUCT_AVAILABILITY_PORT,
      useExisting: ProductAvailabilityUseCase,
    },
    {
      provide: PRODUCT_COLLECTION_FRESHNESS_GATE_PORT,
      useExisting: ProductCollectionFreshnessUseCase,
    },
    {
      provide: SELLPIA_SOURCE_ACCOUNT_PORT,
      useExisting: ProductCollectionFreshnessUseCase,
    },
    {
      provide: PRODUCT_SOURCE_READ_PORT,
      useExisting: ProductSourceReadUseCase,
    },
    {
      provide: PRODUCT_TRANSACTIONAL_READ_PORT,
      useExisting: ProductTransactionalReadRepositoryAdapter,
    },
    {
      provide: PRODUCT_MAPPING_GENERATION_PORT,
      useExisting: ProductMappingGenerationRepositoryAdapter,
    },
  ],
  exports: [
    PRODUCT_AVAILABILITY_PORT,
    PRODUCT_COLLECTION_FRESHNESS_GATE_PORT,
    SELLPIA_SOURCE_ACCOUNT_PORT,
    PRODUCT_SOURCE_READ_PORT,
    PRODUCT_TRANSACTIONAL_READ_PORT,
    PRODUCT_MAPPING_GENERATION_PORT,
  ],
})
export class ProductCollectionRuntimeModule {}
