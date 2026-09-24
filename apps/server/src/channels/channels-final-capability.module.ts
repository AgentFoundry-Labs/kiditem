import { Module } from '@nestjs/common';
import { ChannelsRegistrationExecutionModule } from './channels-registration-execution.module';
import { ChannelsCapabilityCompositionAdapter } from './adapter/in/agent/channels-capability-composition.adapter';
import { CHANNELS_CAPABILITY_COMPOSITION_PORT } from './application/port/in/capability/channels-capability-composition.port';
import { ChannelsModule } from './channels.module';

/**
 * API-only composition of the Channels Agent capabilities: target execution (prepare · start · get ·
 * report) and the representative-image upload. A confirmed registration is `report_target_execution`
 * with `outcome: confirmed` — there is no separate confirmation capability (KID-321).
 */
@Module({
  imports: [ChannelsModule, ChannelsRegistrationExecutionModule],
  providers: [
    ChannelsCapabilityCompositionAdapter,
    { provide: CHANNELS_CAPABILITY_COMPOSITION_PORT, useExisting: ChannelsCapabilityCompositionAdapter },
  ],
  exports: [CHANNELS_CAPABILITY_COMPOSITION_PORT],
})
export class ChannelsFinalCapabilityModule {}
