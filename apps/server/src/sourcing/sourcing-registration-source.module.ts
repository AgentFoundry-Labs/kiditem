import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { REGISTRATION_SOURCE_PORT } from './application/port/in/registration-source.port';
import { RegistrationSourceAdapter } from './adapter/out/repository/registration-source.adapter';

/**
 * 등록 준비가 Sourcing 에 묻는 것은 후보 자격뿐이다. 콘텐츠 작업공간은 AI 공개 port 가
 * 가지므로(KID-310) 여기서는 `AiModule` 을 그대로 다시 내보낸다.
 */
@Module({
  imports: [AiModule],
  providers: [RegistrationSourceAdapter,
    { provide: REGISTRATION_SOURCE_PORT, useExisting: RegistrationSourceAdapter }],
  exports: [AiModule, REGISTRATION_SOURCE_PORT],
})
export class SourcingRegistrationSourceModule {}
