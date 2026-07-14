// Common mock-port factories for advertising application/service specs.
//
// Advertising services depend on `application/port/out/*` tokens; each builder
// here returns a `vi.fn()`-backed object that satisfies the matching port
// interface. Tests then attach `.mockResolvedValue(...)` etc. per case.
//
// One builder per port. Cover every port file in
// `apps/server/src/advertising/application/port/out/` (sans the type-only
// `daily-fact-meta.ts` / `repository-transaction.ts`).

import { vi } from 'vitest';
import type { AdBenchmarkRepositoryPort } from '../../application/port/out/repository/ad-benchmark.repository.port';
import type { AdListingRepositoryPort } from '../../application/port/out/repository/ad-listing.repository.port';
import type { AdConfigRepositoryPort } from '../../application/port/out/repository/ad-config.repository.port';
import type { AdAccountKpiRepositoryPort } from '../../application/port/out/repository/ad-account-kpi.repository.port';
import type { AdCampaignRepositoryPort } from '../../application/port/out/repository/ad-campaign.repository.port';
import type { AdActionRepositoryPort } from '../../application/port/out/repository/ad-action.repository.port';
import type { AdExecutionRepositoryPort } from '../../application/port/out/repository/ad-execution.repository.port';
import type { AdStrategyContextRepositoryPort } from '../../application/port/out/repository/ad-strategy-context.repository.port';
import type { ChannelScrapeRepositoryPort } from '../../application/port/out/repository/channel-scrape.repository.port';
import type { ChannelListingDailyRepositoryPort } from '../../application/port/out/repository/channel-listing-daily.repository.port';
import type { ChannelOptionDailyRepositoryPort } from '../../application/port/out/repository/channel-option-daily.repository.port';
import type { ChannelTargetDailyRepositoryPort } from '../../application/port/out/repository/channel-target-daily.repository.port';
import type { ScrapeTargetRepositoryPort } from '../../application/port/out/repository/scrape-target.repository.port';
import type { KeywordRankRepositoryPort } from '../../application/port/out/repository/keyword-rank.repository.port';
import type { OperationAlertPort } from '../../application/port/out/cross-domain/operation-alert.port';

/** Vitest mock variant of every method on `AdBenchmarkRepositoryPort`. */
export type MockAdBenchmarkRepo = {
  [K in keyof AdBenchmarkRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAdBenchmarkRepo(): MockAdBenchmarkRepo {
  return {
    findBenchmarkAggregates: vi.fn(),
  };
}

export type MockAdListingRepo = {
  [K in keyof AdListingRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAdListingRepo(): MockAdListingRepo {
  return {
    findScopedAdListings: vi.fn(),
    buildAdSyncListingMap: vi.fn(),
    changeAdTier: vi.fn(),
    verifyListingOwnership: vi.fn(),
  };
}

export type MockAdConfigRepo = {
  [K in keyof AdConfigRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAdConfigRepo(): MockAdConfigRepo {
  return {
    findAdSettings: vi.fn(),
    upsertSetting: vi.fn(),
    seedDefaults: vi.fn(),
  };
}

export type MockAdAccountKpiRepo = {
  [K in keyof AdAccountKpiRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAdAccountKpiRepo(): MockAdAccountKpiRepo {
  return {
    findCoupangAdsDaily: vi.fn(),
    upsertAccountKpi: vi.fn(),
  };
}

export type MockAdCampaignRepo = {
  [K in keyof AdCampaignRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAdCampaignRepo(): MockAdCampaignRepo {
  return {
    findCampaignRollups: vi.fn(),
    findProductTargetRollups: vi.fn(),
    findAdTrendDailyRows: vi.fn(),
    findGradeBudgetTotals: vi.fn(),
  };
}

export type MockAdActionRepo = {
  [K in keyof AdActionRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAdActionRepo(): MockAdActionRepo {
  return {
    findAdActionsForReview: vi.fn(),
    findLatestTargetRows: vi.fn(),
    findLatestListingOptionStockById: vi.fn(),
    findExistingInflightActions: vi.fn(),
    createAdActionsFromCandidates: vi.fn(),
    approveAdActions: vi.fn(),
    rejectAdActions: vi.fn(),
    resetFailedAdActions: vi.fn(),
    updateActionOrThrow: vi.fn(),
    findOpenCreateCampaignAction: vi.fn(),
    createCampaignActionWithTask: vi.fn(),
  };
}

export type MockAdExecutionRepo = {
  [K in keyof AdExecutionRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAdExecutionRepo(): MockAdExecutionRepo {
  return {
    upsertWorkerForLease: vi.fn(),
    leaseQueuedTasks: vi.fn(),
    heartbeatWorkerOrThrow: vi.fn(),
    findScopedExecutionTask: vi.fn(),
    findTaskWorkerKey: vi.fn(),
    reportExecutionTask: vi.fn(),
  };
}

export type MockAdStrategyContextRepo = {
  [K in keyof AdStrategyContextRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAdStrategyContextRepo(): MockAdStrategyContextRepo {
  return {
    loadStrategyContext: vi.fn(),
    loadChannelStateByListing: vi.fn(),
    loadLeadTimeByListing: vi.fn(),
    hydrateListings: vi.fn(),
    getInventorySnapshot: vi.fn(),
    loadExposureAnalysisContext: vi.fn(),
    loadAllTimeAdAggregates: vi.fn(),
  };
}

export type MockChannelScrapeRepo = {
  [K in keyof ChannelScrapeRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockChannelScrapeRepo(): MockChannelScrapeRepo {
  return {
    createRun: vi.fn(),
    appendSnapshot: vi.fn(),
    finalizeRun: vi.fn(),
    finalizeRunOnError: vi.fn(),
    findAdCollectStatus: vi.fn(),
    findExtensionStatusSnapshot: vi.fn(),
  };
}

export type MockChannelListingDailyRepo = {
  [K in keyof ChannelListingDailyRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockChannelListingDailyRepo(): MockChannelListingDailyRepo {
  return {
    upsert: vi.fn(),
  };
}

export type MockChannelOptionDailyRepo = {
  [K in keyof ChannelOptionDailyRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockChannelOptionDailyRepo(): MockChannelOptionDailyRepo {
  return {
    upsert: vi.fn(),
  };
}

export type MockChannelTargetDailyRepo = {
  [K in keyof ChannelTargetDailyRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockChannelTargetDailyRepo(): MockChannelTargetDailyRepo {
  return {
    upsert: vi.fn(),
  };
}

export type MockScrapeTargetRepo = {
  [K in keyof ScrapeTargetRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockScrapeTargetRepo(): MockScrapeTargetRepo {
  return {
    listActive: vi.fn(),
    create: vi.fn(),
    markScraped: vi.fn(),
    softDelete: vi.fn(),
  };
}

export type MockKeywordRankRepo = {
  [K in keyof KeywordRankRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockKeywordRankRepo(): MockKeywordRankRepo {
  return {
    listTrackers: vi.fn(),
    upsertTrackerByKeyword: vi.fn(),
    updateTracker: vi.fn(),
    deleteTracker: vi.fn(),
    getTrackerByKeyword: vi.fn(),
    touchTrackerCaptured: vi.fn(),
    listOwnVendorItems: vi.fn(),
    listRepresentativeKeywordOverrides: vi.fn(),
    upsertRepresentativeKeywordOverride: vi.fn(),
    deleteRepresentativeKeywordOverride: vi.fn(),
    hasOwnVendorItem: vi.fn(),
    upsertRankSnapshots: vi.fn(),
    upsertSerpSnapshot: vi.fn(),
    findRankHistory: vi.fn(),
    findRankOverviewSnapshots: vi.fn(),
    replaceWingSalesRankSnapshots: vi.fn(),
    findWingSalesRankSnapshots: vi.fn(),
    findLatestSerp: vi.fn(),
    findRecentSerpSnapshots: vi.fn(),
  };
}

export type MockOperationAlertPort = {
  [K in keyof OperationAlertPort]: ReturnType<typeof vi.fn>;
};

export function buildMockOperationAlertPort(): MockOperationAlertPort {
  return {
    start: vi.fn(),
  };
}
