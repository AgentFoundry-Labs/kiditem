import { AiListingContentQueryModule } from '../../content/ai-listing-content-query.module';
import { ChannelCatalogModule } from '../../channels/channel-catalog.module';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AdvertisingModule } from '../advertising.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AlertsModule } from '../../alerts/alerts.module';
import { AiModule } from '../../content/ai.module';
import { ChannelsModule } from '../../channels/channels.module';
import { AdvertisingProfitabilityReadModule } from '../advertising-profitability-read.module';
import { OperationModule } from '../../common/operation/operation.module';

describe('AdvertisingModule retained wiring', () => {
  it('uses direct Advertising source owners and the operation contract for the Wing daily kinds (KID-362)', () => {
    const imports = Reflect.getMetadata('imports', AdvertisingModule) ?? [];
    expect(imports).toEqual([
      AiListingContentQueryModule,
      ChannelCatalogModule,
      ProductCollectionRuntimeModule,
      PrismaModule,
      AlertsModule,
      AiModule,
      ChannelsModule,
      AdvertisingProfitabilityReadModule,
      OperationModule,
    ]);
    const providerNames = (Reflect.getMetadata('providers', AdvertisingModule) ?? [])
      .map((provider: Function | { provide?: unknown }) =>
        typeof provider === 'function' ? provider.name : String(provider.provide));
    expect(providerNames).not.toContain('AdvertisingProfitabilityOperationHandler');
    expect(providerNames).toContain('CompetitorCatalogOperationOwner');
    // The heuristic exposure score and the account-day KPI owner are retired.
    expect(providerNames).not.toContain('AdExposureService');
    expect(providerNames).not.toContain('AdAccountDailyKpiSourceRepository');
    expect(providerNames).toContain('AdExportService');
    expect(providerNames).toContain('KeywordSerpOperationOwner');
    expect(providerNames).toContain('WingRankOperationOwner');
    expect(providerNames).not.toContain('AdvertisingTrackedWingProductsOperationHandler');
    expect(providerNames).toContain('WingItemwinnerOperationOwner');
    expect(providerNames).toContain('WingTrafficOperationOwner');
    expect(providerNames).not.toContain('AdTrafficSourceRepository');
    expect(providerNames).not.toContain('WingItemwinnerKpiSourceRepository');
    const controllerNames = (Reflect.getMetadata('controllers', AdvertisingModule) ?? []).map((controller: Function) => controller.name);
    expect(controllerNames).toContain('AdKeywordAgentController');
    expect(controllerNames).toContain('AdExportController');
    expect(controllerNames).not.toContain('AdAccountDailyKpiSourceController');
    expect(controllerNames).not.toContain('CompetitorCatalogSourceController');
    expect(controllerNames).not.toContain('KeywordSerpSourceController');
    expect(controllerNames).not.toContain('WingRankSourceController');
    expect(controllerNames).not.toContain('AdStrategyAgentController');
    expect(controllerNames).not.toContain('ProfitabilityAdRefreshController');
  });

  it('publishes no worker lease, heartbeat, or report execution route', () => {
    // The browser extension reports approved-action execution through
    // POST /ads/actions; the worker-lease runtime had no caller and is retired.
    const controllers: Function[] = Reflect.getMetadata('controllers', AdvertisingModule) ?? [];
    const routes = controllers.flatMap((controller) => {
      const base = String(Reflect.getMetadata('path', controller) ?? '');
      return Object.getOwnPropertyNames(controller.prototype)
        .filter((name) => name !== 'constructor')
        .flatMap((name) => {
          const handler = controller.prototype[name];
          const path = typeof handler === 'function'
            ? Reflect.getMetadata('path', handler)
            : undefined;
          return path === undefined ? [] : [`${base}/${String(path)}`];
        });
    });
    expect(routes).toContain('ads/actions');
    expect(routes.filter((route) => route.includes('execution'))).toEqual([]);

    const providerNames = (Reflect.getMetadata('providers', AdvertisingModule) ?? [])
      .map((provider: Function | { provide?: unknown }) =>
        typeof provider === 'function' ? provider.name : String(provider.provide));
    expect(providerNames).not.toContain('AdExecutionService');
    expect(providerNames).not.toContain('AdExecutionRepositoryAdapter');
  });

});
