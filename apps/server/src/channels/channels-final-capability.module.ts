import { Module } from '@nestjs/common';
import { SourcingFrozenRegistrationReadCapabilityModule } from '../sourcing/sourcing-frozen-registration-read-capability.module';
import { ChannelsFinalCapabilityAdapter } from './adapter/in/agent/channels-final-capability.adapter';
import { ChannelsCapabilityCompositionAdapter } from './adapter/in/agent/channels-capability-composition.adapter';
import { CHANNELS_FINAL_CAPABILITY_PORT } from './application/port/in/capability/channels-final-capability.port';
import { CHANNELS_CAPABILITY_COMPOSITION_PORT } from './application/port/in/capability/channels-capability-composition.port';
import { ChannelsModule } from './channels.module';

/** API-only composition: Channels mutation owner plus Sourcing read guard. */
@Module({
  imports: [ChannelsModule, SourcingFrozenRegistrationReadCapabilityModule],
  providers: [
    ChannelsFinalCapabilityAdapter,
    ChannelsCapabilityCompositionAdapter,
    { provide: CHANNELS_FINAL_CAPABILITY_PORT, useExisting: ChannelsFinalCapabilityAdapter },
    { provide: CHANNELS_CAPABILITY_COMPOSITION_PORT, useExisting: ChannelsCapabilityCompositionAdapter },
  ],
  exports: [CHANNELS_FINAL_CAPABILITY_PORT, CHANNELS_CAPABILITY_COMPOSITION_PORT],
})
export class ChannelsFinalCapabilityModule {}
