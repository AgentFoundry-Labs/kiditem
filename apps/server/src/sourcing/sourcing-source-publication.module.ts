import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SourcingSourcePublicationRepositoryAdapter } from './adapter/out/repository/sourcing-source-publication.repository.adapter';
import { SOURCING_SOURCE_PUBLICATION_PORT } from './application/port/in/sourcing-source-publication.port';

/**
 * 소싱 원천의 현재 발행 capability(KID-360). Supply 발주 게이트가 이것만 가져온다 — Sourcing 모듈 전체를
 * 가져오지 않도록 Prisma 말고 아무것도 가져오지 않는다.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    SourcingSourcePublicationRepositoryAdapter,
    { provide: SOURCING_SOURCE_PUBLICATION_PORT, useExisting: SourcingSourcePublicationRepositoryAdapter },
  ],
  exports: [SOURCING_SOURCE_PUBLICATION_PORT],
})
export class SourcingSourcePublicationModule {}
