import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { RegistrationContentWorkspaceAdapter } from './adapter/out/ai/registration-content-workspace.adapter';
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from './application/port/in/registration-content-workspace.port';
import { REGISTRATION_SOURCE_PORT } from './application/port/in/registration-source.port';
import { RegistrationSourceAdapter } from './adapter/out/repository/registration-source.adapter';

@Module({
  imports: [AiModule],
  providers: [RegistrationContentWorkspaceAdapter, RegistrationSourceAdapter,
    { provide: REGISTRATION_CONTENT_WORKSPACE_PORT, useExisting: RegistrationContentWorkspaceAdapter },
    { provide: REGISTRATION_SOURCE_PORT, useExisting: RegistrationSourceAdapter }],
  exports: [REGISTRATION_CONTENT_WORKSPACE_PORT, REGISTRATION_SOURCE_PORT],
})
export class SourcingRegistrationSourceModule {}
