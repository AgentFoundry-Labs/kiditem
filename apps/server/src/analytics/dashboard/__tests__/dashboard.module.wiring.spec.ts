import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { AlertsModule } from '../../../alerts/alerts.module';
import { DashboardModule } from '../dashboard.module';
import { DashboardCapabilityModule } from '../dashboard-capability.module';
import { AdvertisingModule } from '../../../advertising/advertising.module';
import { ProductAbcReadModule } from '../../../products/product-abc-read.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { DashboardController } from '../adapter/in/http/dashboard.controller';
// adapter/out/repository
import { ProfitCalculationRepositoryAdapter } from '../adapter/out/repository/profit-calculation.repository.adapter';
import { WingAdSummaryRepositoryAdapter } from '../adapter/out/repository/wing-ad-summary.repository.adapter';
import { DashboardSalesRepositoryAdapter } from '../adapter/out/repository/dashboard-sales.repository.adapter';
import { DashboardTrendRepositoryAdapter } from '../adapter/out/repository/dashboard-trend.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from '../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { DashboardInventoryRepositoryAdapter } from '../adapter/out/repository/dashboard-inventory.repository.adapter';
// application/service
import { DashboardSalesService } from '../application/service/dashboard-sales.service';
import { DashboardAdService } from '../application/service/dashboard-ad.service';
import { DashboardInventoryService } from '../application/service/dashboard-inventory.service';
import { DashboardTrendService } from '../application/service/dashboard-trend.service';
import { AnalyticsOverviewCapabilityAdapter } from '../adapter/in/agent/analytics-overview-capability.adapter';
import { ANALYTICS_OVERVIEW_CAPABILITY_PORT } from '../application/port/in/analytics-overview-capability.port';
// application/port/out tokens
import { PROFIT_CALCULATION_REPOSITORY_PORT } from '../application/port/out/repository/profit-calculation.repository.port';
import { WING_AD_SUMMARY_REPOSITORY_PORT } from '../application/port/out/repository/wing-ad-summary.repository.port';
import { DASHBOARD_SALES_REPOSITORY_PORT } from '../application/port/out/repository/dashboard-sales.repository.port';
import { DASHBOARD_TREND_REPOSITORY_PORT } from '../application/port/out/repository/dashboard-trend.repository.port';
import { WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT } from '../application/port/out/repository/wing-traffic-aggregation.repository.port';
import { DASHBOARD_INVENTORY_REPOSITORY_PORT } from '../application/port/out/repository/dashboard-inventory.repository.port';

const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const PATH_KEY = 'path';

const EXPECTED_PORT_BINDINGS = [
  [PROFIT_CALCULATION_REPOSITORY_PORT, ProfitCalculationRepositoryAdapter],
  [WING_AD_SUMMARY_REPOSITORY_PORT, WingAdSummaryRepositoryAdapter],
  [DASHBOARD_SALES_REPOSITORY_PORT, DashboardSalesRepositoryAdapter],
  [DASHBOARD_TREND_REPOSITORY_PORT, DashboardTrendRepositoryAdapter],
  [WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT, WingTrafficAggregationRepositoryAdapter],
  [DASHBOARD_INVENTORY_REPOSITORY_PORT, DashboardInventoryRepositoryAdapter],
] as const;

// Architecture-guard companion to dashboard.architecture.spec.ts. This spec
// freezes the @Module()/@Controller() metadata so a missing provider, a
// stray legacy controller, or an accidental route rename fails at vitest
// time before reaching dev:server boot.
describe('DashboardModule capability wiring', () => {
  it('does not import Agent OS from the analytics owner module', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, DashboardModule) ?? [];
    expect(imports).toEqual([DashboardCapabilityModule]);
    // AlertsModule is here because the alert rows this dashboard shows belong to
    // the alerts module. The inventory adapter used to read that table directly,
    // with its own filter, order, and limit.
    expect(Reflect.getMetadata(IMPORTS_KEY, DashboardCapabilityModule) ?? [])
      .toEqual([PrismaModule, ProductAbcReadModule, AdvertisingModule, AlertsModule]);
    expect(Reflect.getMetadata(CONTROLLERS_KEY, DashboardCapabilityModule) ?? [])
      .toEqual([]);
  });

  it('mounts the dashboard controller from adapter/in/http', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, DashboardModule) ?? [];
    expect(new Set(controllers)).toEqual(new Set([DashboardController]));
  });

  it('declares every repository adapter as a provider', () => {
    const capabilityProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, DashboardCapabilityModule) ?? [];
    for (const cls of [
      ProfitCalculationRepositoryAdapter,
      WingAdSummaryRepositoryAdapter,
      DashboardSalesRepositoryAdapter,
      DashboardTrendRepositoryAdapter,
      WingTrafficAggregationRepositoryAdapter,
      DashboardInventoryRepositoryAdapter,
    ]) {
      expect(capabilityProviders).toContain(cls);
    }
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, DashboardCapabilityModule) ?? [];
    for (const cls of [
      DashboardSalesService,
      DashboardAdService,
      DashboardInventoryService,
      DashboardTrendService,
      AnalyticsOverviewCapabilityAdapter,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('binds every application/port/out/* token via a token-shaped provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, DashboardCapabilityModule) ?? [];
    // Token-shaped providers are objects with a `provide` field; everything
    // else is a class provider. The repository ports are bound via
    // useExisting so application services depend on tokens rather than
    // concrete adapter classes.
    const tokenProviders = providers.filter(
      (p): p is { provide: unknown; useExisting?: unknown } =>
        typeof p === 'object' && p !== null && 'provide' in p,
    );
    expect(tokenProviders).toHaveLength(EXPECTED_PORT_BINDINGS.length + 1);
    for (const [token, adapterClass] of EXPECTED_PORT_BINDINGS) {
      expect(tokenProviders).toContainEqual({
        provide: token,
        useExisting: adapterClass,
      });
    }
    expect(tokenProviders).toContainEqual({
      provide: ANALYTICS_OVERVIEW_CAPABILITY_PORT,
      useExisting: AnalyticsOverviewCapabilityAdapter,
    });
  });

  it('keeps the /api/dashboard route prefix', () => {
    expect(Reflect.getMetadata(PATH_KEY, DashboardController)).toBe('dashboard');
  });
});
