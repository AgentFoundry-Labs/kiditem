import { Module } from '@nestjs/common';
import { ChannelsRegistrationExecutionModule } from './channels-registration-execution.module';
import { ChannelsFinalCapabilityAdapter } from './adapter/in/agent/channels-final-capability.adapter';
import { ChannelsCapabilityCompositionAdapter } from './adapter/in/agent/channels-capability-composition.adapter';
import { CHANNELS_FINAL_CAPABILITY_PORT } from './application/port/in/capability/channels-final-capability.port';
import { CHANNELS_CAPABILITY_COMPOSITION_PORT } from './application/port/in/capability/channels-capability-composition.port';
import { ChannelsModule } from './channels.module';
import { REGISTRATION_EXECUTION_REPOSITORY_PORT } from './application/port/out/repository/registration-execution.repository.port';
import { FrozenRegistrationReadService } from './application/service/registration/frozen-registration-read.service';
import { FROZEN_REGISTRATION_READ_PORT } from './application/port/in/capability/frozen-registration-read.port';

/** API-only composition: Channels mutation owner plus the fence's frozen read guard. */
@Module({
  imports: [ChannelsModule, ChannelsRegistrationExecutionModule],
  providers: [
    ChannelsFinalCapabilityAdapter,
    ChannelsCapabilityCompositionAdapter,
    { provide: CHANNELS_FINAL_CAPABILITY_PORT, useExisting: ChannelsFinalCapabilityAdapter },
    { provide: CHANNELS_CAPABILITY_COMPOSITION_PORT, useExisting: ChannelsCapabilityCompositionAdapter },
    // 예전 channels-frozen-registration-read.module.ts — 컨트롤러 없는 읽기 전용 경계.
    {
      provide: FrozenRegistrationReadService,
      useFactory: (
        ...dependencies: ConstructorParameters<
          typeof FrozenRegistrationReadService
        >
      ) => new FrozenRegistrationReadService(...dependencies),
      inject: [REGISTRATION_EXECUTION_REPOSITORY_PORT],
    },
    {
      provide: FROZEN_REGISTRATION_READ_PORT,
      useExisting: FrozenRegistrationReadService,
    },
  ],
  exports: [CHANNELS_FINAL_CAPABILITY_PORT, CHANNELS_CAPABILITY_COMPOSITION_PORT],
})
export class ChannelsFinalCapabilityModule {}
