import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SourcingFrozenRegistrationReadCapabilityAdapter } from './adapter/in/agent/sourcing-frozen-registration-capability.adapter';
import { ProductPreparationRepositoryAdapter } from './adapter/out/repository/product-preparation.repository.adapter';
import { SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT } from './application/port/in/capability/sourcing-frozen-registration-capability.port';
import { PRODUCT_PREPARATION_REPOSITORY_PORT } from './application/port/out/repository/product-preparation.repository.port';

/** Controller-free read-only provenance boundary consumed by Channels. */
@Module({
  imports: [PrismaModule],
  providers: [
    SourcingFrozenRegistrationReadCapabilityAdapter,
    ProductPreparationRepositoryAdapter,
    {
      provide: PRODUCT_PREPARATION_REPOSITORY_PORT,
      useExisting: ProductPreparationRepositoryAdapter,
    },
    {
      provide: SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT,
      useExisting: SourcingFrozenRegistrationReadCapabilityAdapter,
    },
  ],
  exports: [SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT],
})
export class SourcingFrozenRegistrationReadCapabilityModule {}
