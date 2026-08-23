import { Module } from '@nestjs/common';
import { SourcingFrozenRegistrationReadCapabilityModule } from '../sourcing/sourcing-frozen-registration-read-capability.module';
import { ChannelsFinalCapabilityAdapter } from './adapter/in/agent/channels-final-capability.adapter';
import { CHANNELS_FINAL_CAPABILITY_PORT } from './application/port/in/capability/channels-final-capability.port';
import { ChannelsModule } from './channels.module';

/** API-only composition: Channels mutation owner plus Sourcing read guard. */
@Module({
  imports: [ChannelsModule, SourcingFrozenRegistrationReadCapabilityModule],
  providers: [
    ChannelsFinalCapabilityAdapter,
    { provide: CHANNELS_FINAL_CAPABILITY_PORT, useExisting: ChannelsFinalCapabilityAdapter },
  ],
  exports: [CHANNELS_FINAL_CAPABILITY_PORT],
})
export class ChannelsFinalCapabilityModule {}
