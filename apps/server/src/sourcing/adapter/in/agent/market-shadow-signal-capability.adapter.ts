import { Inject, Injectable } from '@nestjs/common';
import type {
  MarketShadowCollectionCapabilityInput,
  MarketShadowCollectionCapabilityPort,
  MarketShadowCollectionCapabilityResult,
} from '../../../application/port/in/capability/market-shadow-capability.port';
import {
  MARKET_SHADOW_OPERATION_PORT,
  type MarketShadowOperationPort,
} from '../../../application/port/out/cross-domain/market-shadow-operation.port';

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
    if (!input.idempotencyKey?.trim()) throw new Error('owner_idempotency_key_required');
    return this.operations.startShadowCollection({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId ?? null,
      triggerSource: 'agent',
      idempotencyKey: input.idempotencyKey,
    });
  }

}
