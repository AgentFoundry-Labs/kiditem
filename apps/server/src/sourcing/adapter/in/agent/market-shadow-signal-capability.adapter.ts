import { Injectable } from '@nestjs/common';
import { SourcingShadowSignalService } from '../../../application/service/sourcing-shadow-signal.service';
import type {
  MarketShadowCollectionCapabilityInput,
  MarketShadowCollectionCapabilityPort,
  MarketShadowCollectionCapabilityResult,
} from '../../../application/port/in/capability/market-shadow-capability.port';

@Injectable()
export class MarketShadowSignalCapabilityAdapter
  implements MarketShadowCollectionCapabilityPort
{
  constructor(
    private readonly shadowSignals: SourcingShadowSignalService,
  ) {}

  async collectShadowSignals(
    input: MarketShadowCollectionCapabilityInput,
  ): Promise<MarketShadowCollectionCapabilityResult> {
    if (!input.idempotencyKey?.trim()) throw new Error('owner_idempotency_key_required');
    return this.shadowSignals.collect(input);
  }

}
