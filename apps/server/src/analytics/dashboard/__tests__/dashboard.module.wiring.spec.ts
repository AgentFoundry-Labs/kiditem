import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { DashboardModule } from '../dashboard.module';
import { PrismaModule } from '../../../prisma/prisma.module';

import { DashboardController } from '../adapter/in/http/dashboard.controller';

// adapter/out/repository
import { ProfitCalculationRepositoryAdapter } from '../adapter/out/repository/profit-calculation.repository.adapter';
import { AdAggregationRepositoryAdapter } from '../adapter/out/repository/ad-aggregation.repository.adapter';
import { WingAdSummaryRepositoryAdapter } from '../adapter/out/repository/wing-ad-summary.repository.adapter';
import { DashboardSalesRepositoryAdapter } from '../adapter/out/repository/dashboard-sales.repository.adapter';
import { DashboardAdRepositoryAdapter } from '../adapter/out/repository/dashboard-ad.repository.adapter';
import { DashboardTrendRepositoryAdapter } from '../adapter/out/repository/dashboard-trend.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from '../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { DashboardInventoryRepositoryAdapter } from '../adapter/out/repository/dashboard-inventory.repository.adapter';

// application/service
import { DashboardSalesService } from '../application/service/dashboard-sales.service';
import { DashboardAdService } from '../application/service/dashboard-ad.service';
import { DashboardInventoryService } from '../application/service/dashboard-inventory.service';
import { DashboardTrendService } from '../application/service/dashboard-trend.service';

const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const PATH_KEY = 'path';

// Architecture-guard companion to dashboard.architecture.spec.ts. This spec
// freezes the @Module()/@Controller() metadata so a missing provider, a
// stray legacy controller, or an accidental route rename fails at vitest
// time before reaching dev:server boot.
describe('DashboardModule capability wiring', () => {
  it('imports exactly PrismaModule', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, DashboardModule) ?? [];
    expect(imports).toHaveLength(1);
    expect(new Set(imports)).toEqual(new Set([PrismaModule]));
  });

  it('mounts the dashboard controller from adapter/in/http', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, DashboardModule) ?? [];
    expect(new Set(controllers)).toEqual(new Set([DashboardController]));
  });

  it('declares every repository adapter as a provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, DashboardModule) ?? [];
    for (const cls of [
      ProfitCalculationRepositoryAdapter,
      AdAggregationRepositoryAdapter,
      WingAdSummaryRepositoryAdapter,
      DashboardSalesRepositoryAdapter,
      DashboardAdRepositoryAdapter,
      DashboardTrendRepositoryAdapter,
      WingTrafficAggregationRepositoryAdapter,
      DashboardInventoryRepositoryAdapter,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, DashboardModule) ?? [];
    for (const cls of [
      DashboardSalesService,
      DashboardAdService,
      DashboardInventoryService,
      DashboardTrendService,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('binds every application/port/out/* token via a token-shaped provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, DashboardModule) ?? [];
    // Token-shaped providers are objects with a `provide` field; everything
    // else is a class provider. The 8 repository ports are bound via
    // useExisting so application services depend on tokens rather than
    // concrete adapter classes.
    const tokenProviders = providers.filter(
      (p): p is { provide: unknown; useExisting?: unknown } =>
        typeof p === 'object' && p !== null && 'provide' in p,
    );
    expect(tokenProviders).toHaveLength(8);
    for (const provider of tokenProviders) {
      expect(provider.useExisting).toBeDefined();
    }
  });

  it('keeps the /api/dashboard route prefix', () => {
    expect(Reflect.getMetadata(PATH_KEY, DashboardController)).toBe('dashboard');
  });
});
