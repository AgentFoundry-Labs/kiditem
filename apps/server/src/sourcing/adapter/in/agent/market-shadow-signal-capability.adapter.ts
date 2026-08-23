import { Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../../common/kst';
import type {
  MarketShadowCollectionCapabilityInput,
  MarketShadowCollectionCapabilityPort,
  MarketShadowCollectionCapabilityResult,
} from '../../../application/port/in/capability/market-shadow-capability.port';
import {
  MARKET_SHADOW_OPERATION_PORT,
  type MarketShadowOperationPort,
} from '../../../application/port/out/cross-domain/market-shadow-operation.port';

const CAPABILITY_KEY = 'sourcing.collect_shadow_signals';

@Injectable()
export class MarketShadowSignalCapabilityAdapter
  implements MarketShadowCollectionCapabilityPort
{
  constructor(
    @Inject(MARKET_SHADOW_OPERATION_PORT)
    private readonly operations: MarketShadowOperationPort,
  ) {}

  async collectShadowSignals(
    input: MarketShadowCollectionCapabilityInput,
  ): Promise<MarketShadowCollectionCapabilityResult> {
    return this.operations.startShadowCollection({
      organizationId: input.organizationId,
      requestedByUserId: null,
      triggerSource: 'agent',
      idempotencyKey: capabilityIdempotencyKey(input.organizationId),
    });
  }

}

function capabilityIdempotencyKey(organizationId: string): string {
  return [
    organizationId,
    CAPABILITY_KEY,
    kstBusinessDate(new Date()).toISOString().slice(0, 10),
  ].join(':');
}
