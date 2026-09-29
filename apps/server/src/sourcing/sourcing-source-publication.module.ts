import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SourcingSourcePublicationRepositoryAdapter } from './adapter/out/persistence/sourcing-source-publication.repository';
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
  // Sourcing 안의 서버 구동 상태 리더(KID-389)가 발행 어댑터의 트랜잭션 읽기를 쓴다.
  exports: [SOURCING_SOURCE_PUBLICATION_PORT, SourcingSourcePublicationRepositoryAdapter],
})
export class SourcingSourcePublicationModule {}
