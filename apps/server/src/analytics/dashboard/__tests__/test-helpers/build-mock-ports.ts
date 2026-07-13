// Common mock-port factories for analytics/dashboard application/service
// specs. Dashboard services depend on `application/port/out/*` tokens; each
// builder here returns a `vi.fn()`-backed object satisfying the matching
// port interface. Tests attach `.mockResolvedValue(...)` etc. per case.
//
// One builder per port file under
// `apps/server/src/analytics/dashboard/application/port/out/`.

import { vi } from 'vitest';
import type { ProfitCalculationRepositoryPort } from '../../application/port/out/repository/profit-calculation.repository.port';
import type { AdAggregationRepositoryPort } from '../../application/port/out/repository/ad-aggregation.repository.port';
import type { WingAdSummaryRepositoryPort } from '../../application/port/out/repository/wing-ad-summary.repository.port';
import type { DashboardSalesRepositoryPort } from '../../application/port/out/repository/dashboard-sales.repository.port';
import type { DashboardAdRepositoryPort } from '../../application/port/out/repository/dashboard-ad.repository.port';
import type { DashboardTrendRepositoryPort } from '../../application/port/out/repository/dashboard-trend.repository.port';
import type { WingTrafficAggregationRepositoryPort } from '../../application/port/out/repository/wing-traffic-aggregation.repository.port';
import type { DashboardInventoryRepositoryPort } from '../../application/port/out/repository/dashboard-inventory.repository.port';

export type MockProfitCalculationRepo = {
  [K in keyof ProfitCalculationRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockProfitCalculationRepo(): MockProfitCalculationRepo {
  return {
    calculateForRange: vi.fn(),
  };
}

export type MockAdAggregationRepo = {
  [K in keyof AdAggregationRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAdAggregationRepo(): MockAdAggregationRepo {
  return {
    aggregateForRange: vi.fn(),
  };
}

export type MockWingAdSummaryRepo = {
  [K in keyof WingAdSummaryRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockWingAdSummaryRepo(): MockWingAdSummaryRepo {
  return {
    fetchCurrentMonthSummary: vi.fn(),
  };
}

export type MockDashboardSalesRepo = {
  [K in keyof DashboardSalesRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockDashboardSalesRepo(): MockDashboardSalesRepo {
  return {
    fetchTodayKpis: vi.fn(),
    fetchTopProducts: vi.fn(),
    fetchDailyRevenue: vi.fn(),
  };
}

export type MockDashboardAdRepo = {
  [K in keyof DashboardAdRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockDashboardAdRepo(): MockDashboardAdRepo {
  return {
    fetchDailyAdCost: vi.fn(),
  };
}

export type MockDashboardTrendRepo = {
  [K in keyof DashboardTrendRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockDashboardTrendRepo(): MockDashboardTrendRepo {
  return {
    fetchTrendRevenueRows: vi.fn(),
    fetchTrendAdCostRows: vi.fn(),
  };
}

export type MockWingTrafficAggregationRepo = {
  [K in keyof WingTrafficAggregationRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockWingTrafficAggregationRepo(): MockWingTrafficAggregationRepo {
  return {
    aggregateTraffic: vi.fn(),
    aggregateCoupangAds: vi.fn(),
    findLatestDataDate: vi.fn(),
    fetchDailyTrend: vi.fn(),
    fetchDailyAds: vi.fn(),
  };
}

export type MockDashboardInventoryRepo = {
  [K in keyof DashboardInventoryRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockDashboardInventoryRepo(): MockDashboardInventoryRepo {
  return {
    countActiveProductsByGrade: vi.fn(),
    findUnreadAlerts: vi.fn(),
    countActiveProducts: vi.fn(),
    countChannelLinkedProducts: vi.fn(),
    fetchPerListingMetrics: vi.fn(),
    countOutOfStockInventorySkus: vi.fn(),
    countMappingAttentionChannelSkus: vi.fn(),
    countChannelSkusByMappingStatus: vi.fn(),
    findGradeHistory: vi.fn(),
    countLowCtrThumbnails: vi.fn(),
    findAGradeReviewCounts: vi.fn(),
  };
}
