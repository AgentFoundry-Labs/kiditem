import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AdvertisingModule } from '../advertising.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AlertsModule } from '../../alerts/alerts.module';
import { AiModule } from '../../ai/ai.module';
import { ChannelsModule } from '../../channels/channels.module';
import { OperationsModule } from '../../operations/operations.module';
import { AdvertisingProfitabilityReadModule } from '../advertising-profitability-read.module';

describe('AdvertisingModule retained wiring', () => {
  it('uses owner modules without the removed Agent OS execution wrapper', () => {
    const imports = Reflect.getMetadata('imports', AdvertisingModule) ?? [];
    expect(imports).toEqual([
      PrismaModule,
      AlertsModule,
      AiModule,
      ChannelsModule,
      OperationsModule,
      AdvertisingProfitabilityReadModule,
    ]);
    const providerNames = (Reflect.getMetadata('providers', AdvertisingModule) ?? [])
      .map((provider: Function | { provide?: unknown }) =>
        typeof provider === 'function' ? provider.name : String(provider.provide));
    expect(providerNames).not.toContain('AdvertisingProfitabilityOperationHandler');
    expect(providerNames).toContain('CompetitorCatalogOperationService');
    expect(providerNames).toContain('AdvertisingCompetitorCatalogOperationHandler');
    expect(providerNames).not.toContain('AdvertisingTrackedWingProductsOperationHandler');
    const controllerNames = (Reflect.getMetadata('controllers', AdvertisingModule) ?? []).map((controller: Function) => controller.name);
    expect(controllerNames).toContain('AdKeywordAgentController');
    expect(controllerNames).not.toContain('AdStrategyAgentController');
    expect(controllerNames).not.toContain('ProfitabilityAdRefreshController');
  });

  it('requires the concrete source-failure alert seam for tracked Wing terminal writes', () => {
    const adapter = readFileSync(resolve(
      __dirname,
      '../adapter/out/repository/wing-tracked-product-source-attempt.repository.adapter.ts',
    ), 'utf8');
    expect(adapter).not.toMatch(/@Optional\(\)\s+private readonly alerts/);
    expect(adapter).not.toMatch(/alerts\?\./);
  });
});
