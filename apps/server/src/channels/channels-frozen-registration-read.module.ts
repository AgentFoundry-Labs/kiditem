import { Module } from '@nestjs/common';
import { REGISTRATION_EXECUTION_REPOSITORY_PORT } from './application/port/out/repository/registration-execution.repository.port';
import { FrozenRegistrationReadService } from './application/service/registration/frozen-registration-read.service';
import { FROZEN_REGISTRATION_READ_PORT } from './application/port/in/capability/frozen-registration-read.port';
import { ChannelsRegistrationExecutionModule } from './channels-registration-execution.module';

/** Controller-free read-only boundary over the fence's frozen submission. */
@Module({
  imports: [ChannelsRegistrationExecutionModule],
  providers: [
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
  exports: [FROZEN_REGISTRATION_READ_PORT],
})
export class ChannelsFrozenRegistrationReadModule {}
