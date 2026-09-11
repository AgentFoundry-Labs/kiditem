// Common mock-port factories for analytics/dashboard application/service
// specs. Dashboard services depend on `application/port/out/*` tokens; each
// builder here returns a `vi.fn()`-backed object satisfying the matching
// port interface. Tests attach `.mockResolvedValue(...)` etc. per case.
//
// One builder per port file under
// `apps/server/src/analytics/dashboard/application/port/out/`.

import { vi, type Mocked } from 'vitest';
import type { ResolvedDashboardPeriod } from '../../domain/period/dashboard-period';
import type {
  ProfitCalculationRepositoryPort,
  ProfitSourceCoverage,
} from '../../application/port/out/repository/profit-calculation.repository.port';
import type { WingAdSummaryRepositoryPort } from '../../application/port/out/repository/wing-ad-summary.repository.port';
import type { DashboardSalesRepositoryPort } from '../../application/port/out/repository/dashboard-sales.repository.port';
import type { DashboardTrendRepositoryPort } from '../../application/port/out/repository/dashboard-trend.repository.port';
import type { WingTrafficAggregationRepositoryPort } from '../../application/port/out/repository/wing-traffic-aggregation.repository.port';
import type { DashboardInventoryRepositoryPort } from '../../application/port/out/repository/dashboard-inventory.repository.port';

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
    adEvidence: 'OBSERVED',
  };
}

export type MockWingAdSummaryRepo = Mocked<WingAdSummaryRepositoryPort>;

export function buildMockWingAdSummaryRepo(): MockWingAdSummaryRepo {
  return {
    fetchCurrentMonthSummary: vi.fn(),
  };
}

export type MockDashboardSalesRepo = Mocked<DashboardSalesRepositoryPort>;

export function buildMockDashboardSalesRepo(): MockDashboardSalesRepo {
  return {
    fetchTodayKpis: vi.fn(),
    fetchTopProducts: vi.fn(),
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
    findLatestDataDate: vi.fn(),
    fetchDailyTrend: vi.fn(),
    fetchDailyAds: vi.fn(),
  };
}

export type MockDashboardInventoryRepo = Mocked<DashboardInventoryRepositoryPort>;

export function buildMockDashboardInventoryRepo(): MockDashboardInventoryRepo {
  return {
    countActiveProductsByGrade: vi.fn(),
    countActiveProductsByAbcStatus: vi.fn(),
    findActiveAbcContributions: vi.fn(),
    countUnclassifiedActiveProducts: vi.fn(),
    findAbcFormula: vi.fn(),
    findUnreadAlerts: vi.fn(),
    countActiveProducts: vi.fn(),
    fetchPerListingMetrics: vi.fn(),
    countOutOfStockMasterProducts: vi.fn(),
    getSellingChannelMappingSummary: vi.fn(),
    findGradeHistory: vi.fn(),
    countLowCtrThumbnails: vi.fn(),
    findAGradeReviewCounts: vi.fn(),
  };
}
