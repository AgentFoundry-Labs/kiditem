import { Module } from '@nestjs/common';
import { ChannelsCapabilityCompositionAdapter } from './adapter/in/agent/channels-capability-composition.adapter';
import { CHANNELS_CAPABILITY_COMPOSITION_PORT } from './application/port/in/capability/channels-capability-composition.port';

/**
 * API-only composition of the Channels Agent capabilities. Empty since KID-364: the target-execution and
 * representative-image capabilities were retired with the registration execution table.
 */
@Module({
  providers: [
    ChannelsCapabilityCompositionAdapter,
    { provide: CHANNELS_CAPABILITY_COMPOSITION_PORT, useExisting: ChannelsCapabilityCompositionAdapter },
  ],
  exports: [CHANNELS_CAPABILITY_COMPOSITION_PORT],
})
export class ChannelsFinalCapabilityModule {}
