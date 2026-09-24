// Common mock-port factories for analytics dashboard application/service
// specs. Dashboard services depend on `application/port/out/*` tokens; each
// builder here returns a `vi.fn()`-backed object satisfying the matching
// port interface. Tests attach `.mockResolvedValue(...)` etc. per case.
//
// One builder per port file under
// `apps/server/src/analytics/application/port/out/repository/dashboard/`.

import { vi, type Mocked } from 'vitest';
import type { ResolvedDashboardPeriod } from '../../../domain/dashboard/period/dashboard-period';
import type {
  ProfitCalculationRepositoryPort,
  ProfitSourceCoverage,
} from '../../../application/port/out/repository/dashboard/profit-calculation.repository.port';
import type { DashboardSalesRepositoryPort } from '../../../application/port/out/repository/dashboard/dashboard-sales.repository.port';
import type { TodayKpiRow } from '../../../application/port/out/repository/dashboard/dashboard-sales.repository.port';
import type { DashboardTrendRepositoryPort } from '../../../application/port/out/repository/dashboard/dashboard-trend.repository.port';
import type { WingTrafficAggregationRepositoryPort } from '../../../application/port/out/repository/dashboard/wing-traffic-aggregation.repository.port';
import type { DashboardInventoryRepositoryPort } from '../../../application/port/out/repository/dashboard/dashboard-inventory.repository.port';

export type MockProfitCalculationRepo = Mocked<ProfitCalculationRepositoryPort>;

export function buildMockProfitCalculationRepo(): MockProfitCalculationRepo {
  return {
    calculateForRange: vi.fn(),
    calculateDailyForRange: vi.fn(),
  };
}

/**
 * Business-date evidence for a mocked `RangeProfitMetrics`. Reads the dates the
 * caller's resolved period already carries — the same set the real adapter
 * reads — so a fixture claiming order revenue or ad spend also carries the
 * dates that revenue came from. Pass `orders: false` for a fixture whose order
 * totals are genuinely source-empty.
 */
export function buildProfitSourceCoverage(
  period: ResolvedDashboardPeriod,
  options: { orders?: boolean } = {},
): ProfitSourceCoverage {
  const requestedDates = period.selectedDates;
  return {
    requestedDates,
    orderDates: options.orders === false ? [] : [...requestedDates],
    adDates: [...requestedDates],
    hasAdAccount: true,
  };
}

export type MockDashboardSalesRepo = Mocked<DashboardSalesRepositoryPort>;

export function buildMockDashboardSalesRepo(): MockDashboardSalesRepo {
  return {
    fetchTodayKpis: vi.fn(),
    fetchTopProducts: vi.fn(),
    // Most summaries rank orders; a case that exercises the Sellpia month
    // ranking resolves its own read.
    fetchSellpiaTopProducts: vi.fn().mockResolvedValue(null),
  };
}

export function buildTodayKpiRow(
  overrides: Partial<TodayKpiRow> = {},
): TodayKpiRow {
  return {
    revenue: 0,
    orders: 0,
    collectedOrders: 0,
    requestedDates: ['2026-09-08'],
    includedDates: ['2026-09-08'],
    missingDates: [],
    observedAt: new Date('2026-09-08T01:00:00.000Z'),
    ...overrides,
  };
}

export type MockDashboardTrendRepo = Mocked<DashboardTrendRepositoryPort>;

export function buildMockDashboardTrendRepo(): MockDashboardTrendRepo {
  return {
    fetchTrendRevenueRows: vi.fn(),
  };
}

export type MockWingTrafficAggregationRepo = Mocked<WingTrafficAggregationRepositoryPort>;

export function buildMockWingTrafficAggregationRepo(): MockWingTrafficAggregationRepo {
  return {
    aggregateTraffic: vi.fn(),
    aggregateCoupangAds: vi.fn(),
    readTrafficFunnel: vi.fn().mockResolvedValue({
      visitors: null,
      views: null,
      cartAdds: null,
      cartRate: null,
      orders: null,
      orderCartRate: null,
      salesQty: null,
      revenue: null,
      conversionRate: null,
      dailyAverageVisitors: null,
      metricDates: {
        visitors: [],
        views: [],
        cartAdds: [],
        cartRate: [],
        orders: [],
        orderCartRate: [],
        salesQty: [],
        revenue: [],
        conversionRate: [],
      },
      intersectionListingCount: 0,
      intersectionListingDateCount: 0,
      trafficCoverage: null,
      trafficObservedAt: null,
      orderObservedAt: null,
    }),
    readAdRateFacts: vi.fn().mockResolvedValue({
      adSpend: null,
      revenue: null,
      revenueSource: 'unavailable',
      includedDates: [],
      adCoverageComplete: false,
    }),
    findLatestDataDate: vi.fn(),
    fetchDailyTrend: vi.fn(),
    fetchDailyAds: vi.fn(),
  };
}

export type MockDashboardInventoryRepo = Mocked<DashboardInventoryRepositoryPort>;

export function buildMockDashboardInventoryRepo(): MockDashboardInventoryRepo {
  return {
    readProductAbcFacts: vi.fn(),
    findUnreadAlerts: vi.fn(),
    countActiveProducts: vi.fn(),
    fetchPerListingMetrics: vi.fn(),
    readInventoryAvailabilityFacts: vi.fn(),
    findReviewCountsForProducts: vi.fn(),
  };
}
