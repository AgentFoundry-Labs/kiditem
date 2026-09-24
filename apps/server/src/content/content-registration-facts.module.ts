import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CONTENT_REGISTRATION_FACTS_PORT } from './application/port/in/workspace/registration-content-facts.port';
import { RegistrationContentFactsRepositoryAdapter } from './adapter/out/repository/registration-content-facts.repository.adapter';

/**
 * Channels 등록 상태 reader 가 쓰는 Content 읽기 하나(KID-320). Prisma 만 가져온다 — 생성 runtime 도 Channels 도
 * 가져오지 않아, Channels 의 가벼운 사실 모듈이 AiModule 을 거치는 순환 없이 가져올 수 있다.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    RegistrationContentFactsRepositoryAdapter,
    { provide: CONTENT_REGISTRATION_FACTS_PORT, useExisting: RegistrationContentFactsRepositoryAdapter },
  ],
  exports: [CONTENT_REGISTRATION_FACTS_PORT],
})
export class ContentRegistrationFactsModule {}
