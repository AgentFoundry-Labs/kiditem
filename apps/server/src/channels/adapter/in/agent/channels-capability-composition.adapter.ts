import { Injectable } from '@nestjs/common';
import type { ChannelsCapabilityCompositionPort } from '../../../application/port/in/capability/channels-capability-composition.port';

/**
 * Channels owns the definition-to-marketplace-owner-port Adapters. No Channels capability is composed since KID-364:
 * mall writes start from the operator screens through the operation contract (see `channels.capabilities.ts`).
 */
@Injectable()
export class ChannelsCapabilityCompositionAdapter implements ChannelsCapabilityCompositionPort {
  readonly compositions = [];
}
