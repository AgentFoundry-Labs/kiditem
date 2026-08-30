import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ANALYTICS_CAPABILITY_COMPOSITION_PORT,
  type AnalyticsCapabilityCompositionPort,
} from '../../../analytics/application/port/in/capability/analytics-capability-composition.port';
import {
  CHANNELS_CAPABILITY_COMPOSITION_PORT,
  type ChannelsCapabilityCompositionPort,
} from '../../../channels/application/port/in/capability/channels-capability-composition.port';
import {
  PRODUCTS_CAPABILITY_COMPOSITION_PORT,
  type ProductsCapabilityCompositionPort,
} from '../../../products/application/port/in/capability/products-capability-composition.port';
import {
  SOURCING_CAPABILITY_COMPOSITION_PORT,
  type SourcingCapabilityCompositionPort,
} from '../../../sourcing/application/port/in/capability/sourcing-capability-composition.port';
import {
  SUPPLY_CAPABILITY_COMPOSITION_PORT,
  type SupplyCapabilityCompositionPort,
} from '../../../supply/application/port/in/capability/supply-capability-composition.port';
import { FINAL_CAPABILITY_DEFINITIONS } from '../../domain/catalog/final-capability.catalog';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';
import type { CapabilityCompositionProvider } from '../../../common/capability-composition';

export { FINAL_CAPABILITY_DEFINITIONS } from '../../domain/catalog/final-capability.catalog';

/**
 * Agent OS aggregates already validated owner-local composition units. It does
 * not select owner methods or reconstruct business inputs.
 */
export function registerFinalCapabilityCatalog(
  registry: AgentCapabilityRegistry,
  owners: readonly CapabilityCompositionProvider[],
): void {
  for (const owner of owners) {
    for (const composition of owner.compositions) {
      registry.registerComposition(composition);
    }
  }
  registry.assertFinalCatalog(FINAL_CAPABILITY_DEFINITIONS);
}

@Injectable()
export class FinalCapabilityCatalogRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(ANALYTICS_CAPABILITY_COMPOSITION_PORT)
    private readonly analytics: AnalyticsCapabilityCompositionPort,
    @Inject(CHANNELS_CAPABILITY_COMPOSITION_PORT)
    private readonly channels: ChannelsCapabilityCompositionPort,
    @Inject(PRODUCTS_CAPABILITY_COMPOSITION_PORT)
    private readonly products: ProductsCapabilityCompositionPort,
    @Inject(SOURCING_CAPABILITY_COMPOSITION_PORT)
    private readonly sourcing: SourcingCapabilityCompositionPort,
    @Inject(SUPPLY_CAPABILITY_COMPOSITION_PORT)
    private readonly supply: SupplyCapabilityCompositionPort,
  ) {}

  onModuleInit(): void {
    registerFinalCapabilityCatalog(this.registry, [
      this.analytics,
      this.channels,
      this.products,
      this.sourcing,
      this.supply,
    ]);
  }
}
