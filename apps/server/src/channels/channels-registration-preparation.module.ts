import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SourcingRegistrationSourceModule } from '../sourcing/sourcing-registration-source.module';
import { SalesProductModule } from './sales-product.module';
import { RegistrationDraftAdapter } from './adapter/out/persistence/candidate-registration-draft.adapter';
import { ProductPreparationRepositoryAdapter } from './adapter/out/persistence/candidate-registration.repository.adapter';
import { CANDIDATE_REGISTRATION_PORT } from './application/port/in/candidate-registration.port';
import { REGISTRATION_DRAFT_PORT } from './application/port/out/persistence/registration-draft.port';

/** Compatibility entry for candidate-originated registration; all target writes remain in Channels. */
@Module({
  imports: [PrismaModule, SourcingRegistrationSourceModule, SalesProductModule],
  providers: [RegistrationDraftAdapter, ProductPreparationRepositoryAdapter,
    { provide: REGISTRATION_DRAFT_PORT, useExisting: RegistrationDraftAdapter },
    { provide: CANDIDATE_REGISTRATION_PORT, useExisting: ProductPreparationRepositoryAdapter }],
  exports: [REGISTRATION_DRAFT_PORT, CANDIDATE_REGISTRATION_PORT],
})
export class ChannelsRegistrationPreparationModule {}
