import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AgentOsCapabilityModule } from '../agent-os-capability.module';
import { AnalyticsCapabilityCompositionAdapter } from '../../analytics/adapter/in/agent/analytics-capability-composition.adapter';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { ANALYTICS_CAPABILITY_COMPOSITION_PORT } from '../../analytics/application/port/in/capability/analytics-capability-composition.port';
import { ChannelsCapabilityCompositionAdapter } from '../../channels/adapter/in/agent/channels-capability-composition.adapter';
import { ChannelsFinalCapabilityModule } from '../../channels/channels-final-capability.module';
import { CHANNELS_CAPABILITY_COMPOSITION_PORT } from '../../channels/application/port/in/capability/channels-capability-composition.port';
import { ProductsCapabilityCompositionAdapter } from '../../products/adapter/in/agent/products-capability-composition.adapter';
import { ProductsModule } from '../../products/products.module';
import { PRODUCTS_CAPABILITY_COMPOSITION_PORT } from '../../products/application/port/in/capability/products-capability-composition.port';
import { SourcingCapabilityCompositionAdapter } from '../../sourcing/adapter/in/agent/sourcing-capability-composition.adapter';
import { SourcingModule } from '../../sourcing/sourcing.module';
import { SOURCING_CAPABILITY_COMPOSITION_PORT } from '../../sourcing/application/port/in/capability/sourcing-capability-composition.port';
import { SupplyCapabilityCompositionAdapter } from '../../supply/adapter/in/agent/supply-capability-composition.adapter';
import { SupplyAgentRuntimeModule } from '../../supply/supply-agent-runtime.module';
import { SUPPLY_CAPABILITY_COMPOSITION_PORT } from '../../supply/application/port/in/capability/supply-capability-composition.port';
import { AgentWorkCapabilityApplicationModule } from '../../agent-work-capability-application.module';

const PROVIDERS_KEY = 'providers';

function providers(module: object): unknown[] {
  return Reflect.getMetadata(PROVIDERS_KEY, module) ?? [];
}

function expectCompositionBinding(
  module: object,
  token: symbol,
  adapter: unknown,
): void {
  const entries = providers(module);
  expect(entries).toContain(adapter);
  expect(entries).toContainEqual({ provide: token, useExisting: adapter });
  expect(Reflect.getMetadata('exports', module) ?? []).toContain(token);
}

describe('owner-local capability composition module wiring', () => {
  it('exports each owner definition-to-port Adapter from its own Module', () => {
    expectCompositionBinding(
      AnalyticsModule,
      ANALYTICS_CAPABILITY_COMPOSITION_PORT,
      AnalyticsCapabilityCompositionAdapter,
    );
    expectCompositionBinding(
      ChannelsFinalCapabilityModule,
      CHANNELS_CAPABILITY_COMPOSITION_PORT,
      ChannelsCapabilityCompositionAdapter,
    );
    expectCompositionBinding(
      ProductsModule,
      PRODUCTS_CAPABILITY_COMPOSITION_PORT,
      ProductsCapabilityCompositionAdapter,
    );
    expectCompositionBinding(
      SourcingModule,
      SOURCING_CAPABILITY_COMPOSITION_PORT,
      SourcingCapabilityCompositionAdapter,
    );
    expectCompositionBinding(
      SupplyAgentRuntimeModule,
      SUPPLY_CAPABILITY_COMPOSITION_PORT,
      SupplyCapabilityCompositionAdapter,
    );
  });

  it('keeps Agent OS as an aggregation Module with no central owner-method dispatch map', () => {
    const registrar = readFileSync(
      new URL(
        '../application/service/final-capability-catalog-registrar.service.ts',
        import.meta.url,
      ),
      'utf8',
    );

    for (const forbidden of [
      'SOURCING_FINAL_CAPABILITY_PORT',
      'CHANNELS_FINAL_CAPABILITY_PORT',
      'CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT',
      'PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT',
      'SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT',
      'ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT',
      'OwnerInput',
      'as never',
      'as unknown',
      'channels.submit_coupang_listing',
      'sourcing.ingestCandidate',
      'supply.submit_purchase_order',
    ]) {
      expect(registrar).not.toContain(forbidden);
    }
    expect(registrar).toContain('registerComposition');
    expect(registrar).toContain('CAPABILITY_COMPOSITION_PORT');
  });

  it('uses the existing application Module imports as the sole aggregation seam', () => {
    const imports: unknown[] =
      Reflect.getMetadata('imports', AgentWorkCapabilityApplicationModule) ?? [];

    expect(imports).toEqual(
      expect.arrayContaining([
        AgentOsCapabilityModule,
        AnalyticsModule,
        ChannelsFinalCapabilityModule,
        ProductsModule,
        SourcingModule,
        SupplyAgentRuntimeModule,
      ]),
    );
  });
});
