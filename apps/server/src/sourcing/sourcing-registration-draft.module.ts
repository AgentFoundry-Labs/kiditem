import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RegistrationDraftAdapter } from './adapter/out/channels/registration-draft.adapter';
import { RegistrationContentWorkspaceAdapter } from './adapter/out/ai/registration-content-workspace.adapter';
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from './application/port/out/cross-domain/registration-content-workspace.port';
import { REGISTRATION_DRAFT_PORT } from '../channels/application/port/out/cross-domain/registration-draft.port';

/**
 * 등록 울타리가 초안에 닿는 통로만 내주는 좁은 모듈.
 *
 * `SourcingModule` 전체가 아니라 이것만 Channels 가 가져가므로 모듈 순환이 없다 —
 * Sourcing 은 울타리 실행 모듈을, Channels 는 이 초안 모듈을 가져간다.
 */
@Module({
  imports: [PrismaModule, AiModule],
  providers: [
    RegistrationContentWorkspaceAdapter,
    RegistrationDraftAdapter,
    {
      provide: REGISTRATION_CONTENT_WORKSPACE_PORT,
      useExisting: RegistrationContentWorkspaceAdapter,
    },
    { provide: REGISTRATION_DRAFT_PORT, useExisting: RegistrationDraftAdapter },
  ],
  exports: [REGISTRATION_DRAFT_PORT],
})
export class SourcingRegistrationDraftModule {}
