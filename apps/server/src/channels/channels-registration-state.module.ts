import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentRegistrationFactsModule } from '../content/content-registration-facts.module';
import { RegistrationStateRepositoryAdapter } from './adapter/out/persistence/registration-state.repository.adapter';
import { RegistrableContentFactsAdapter } from './adapter/out/content/registrable-content-facts.adapter';
import { RegistrationStateService } from './application/service/registration/registration-state.service';
import { REGISTRATION_STATE_PORT } from './application/port/in/registration-state.port';
import { REGISTRATION_STATE_PERSISTENCE_PORT } from './application/port/out/persistence/registration-state.persistence.port';
import { CHANNEL_REGISTRABLE_CONTENT_FACTS_PORT } from './application/port/out/content/registrable-content-facts.port';

/**
 * 하나뿐인 등록 상태 reader(KID-313 결정 11, KID-320). 등록 상태 경로 · 판매 상품 목록 · 리스팅 요약 · 몰
 * 매트릭스가 모두 이 모듈의 `REGISTRATION_STATE_PORT` 를 읽는다. 판매 상품 · 리스팅 · 매트릭스 모듈이 저마다
 * 가져오므로 그 모듈들을 가져오지 않는다 — Channels 행은 자기 persistence 어댑터로, 지금 콘텐츠는 Content 의
 * 현재 콘텐츠 id 두 개만 내는 가벼운 `ContentRegistrationFactsModule` 로 읽는다(AiModule 은 Channels 카탈로그
 * 모듈을 가져오므로 그것을 가져오면 순환이 된다).
 */
@Module({
  imports: [PrismaModule, ContentRegistrationFactsModule],
  providers: [
    RegistrationStateRepositoryAdapter,
    { provide: REGISTRATION_STATE_PERSISTENCE_PORT, useExisting: RegistrationStateRepositoryAdapter },
    RegistrableContentFactsAdapter,
    { provide: CHANNEL_REGISTRABLE_CONTENT_FACTS_PORT, useExisting: RegistrableContentFactsAdapter },
    {
      provide: RegistrationStateService,
      useFactory: (...dependencies: ConstructorParameters<typeof RegistrationStateService>) => new RegistrationStateService(...dependencies),
      inject: [REGISTRATION_STATE_PERSISTENCE_PORT, CHANNEL_REGISTRABLE_CONTENT_FACTS_PORT],
    },
    { provide: REGISTRATION_STATE_PORT, useExisting: RegistrationStateService },
  ],
  exports: [REGISTRATION_STATE_PORT],
})
export class ChannelsRegistrationStateModule {}
