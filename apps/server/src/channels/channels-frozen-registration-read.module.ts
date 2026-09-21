import { Module } from '@nestjs/common';
import { FrozenRegistrationReadAdapter } from './adapter/in/agent/frozen-registration-read.adapter';
import { FROZEN_REGISTRATION_READ_PORT } from './application/port/in/capability/frozen-registration-read.port';
import { ChannelsRegistrationExecutionModule } from './channels-registration-execution.module';

/** Controller-free read-only boundary over the fence's frozen submission. */
@Module({
  imports: [ChannelsRegistrationExecutionModule],
  providers: [
    FrozenRegistrationReadAdapter,
    {
      provide: FROZEN_REGISTRATION_READ_PORT,
      useExisting: FrozenRegistrationReadAdapter,
    },
  ],
  exports: [FROZEN_REGISTRATION_READ_PORT],
})
export class ChannelsFrozenRegistrationReadModule {}
