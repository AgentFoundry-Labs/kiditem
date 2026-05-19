// Transitional facade over the channels-namespace persistence adapters.
// Kept inside `apps/server/src/advertising/services/` after the Wave H2
// Lane AD convergence move because the integration tests in
// `apps/server/src/advertising/__tests__/` (channel-scrape-dual-write,
// ad-sync-flow) still inject this @Injectable wrapper by class name.
//
// This facade now delegates to repository adapters via outgoing ports
// (`application/port/out/repository/*.repository.port.ts`), not to function helpers
// directly. The actual persistence logic lives in the adapters bound to
// those ports inside the advertising Nest module.
//
// New callers should inject the repository ports directly. This facade
// may be removed once the integration tests stop relying on the
// class-name binding.

import { Inject, Injectable } from '@nestjs/common';
import {
  AD_ACCOUNT_KPI_REPOSITORY_PORT,
  type AdAccountKpiRepositoryPort,
  type UpsertAccountKpiInput,
} from '../application/port/out/repository/ad-account-kpi.repository.port';
import {
  CHANNEL_LISTING_DAILY_REPOSITORY_PORT,
  type ChannelListingDailyRepositoryPort,
  type ListingDailyUpsertInput,
} from '../application/port/out/repository/channel-listing-daily.repository.port';
import {
  CHANNEL_OPTION_DAILY_REPOSITORY_PORT,
  type ChannelOptionDailyRepositoryPort,
  type ListingOptionDailyUpsertInput,
} from '../application/port/out/repository/channel-option-daily.repository.port';
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
  type ScrapeRunFinalize,
  type ScrapeRunInput,
  type ScrapeSnapshotInput,
} from '../application/port/out/repository/channel-scrape.repository.port';
import {
  CHANNEL_TARGET_DAILY_REPOSITORY_PORT,
  type ChannelTargetDailyRepositoryPort,
  type UpsertAdTargetDailyInput,
} from '../application/port/out/repository/channel-target-daily.repository.port';

// Re-export public types so existing imports against this module keep
// resolving while consumers migrate to the port modules.
export type { ScrapeMatchStatus } from '../domain/listing-match';
export type {
  ListingDailyState,
  ListingDailyTrafficMetrics,
} from '../application/port/out/repository/channel-listing-daily.repository.port';
export type { ListingOptionDailyState } from '../application/port/out/repository/channel-option-daily.repository.port';
export type { AdTargetDailyMetrics } from '../application/port/out/repository/channel-target-daily.repository.port';

@Injectable()
export class ChannelScrapePersistenceService {
  constructor(
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
    @Inject(CHANNEL_LISTING_DAILY_REPOSITORY_PORT)
    private readonly listingDailyRepo: ChannelListingDailyRepositoryPort,
    @Inject(CHANNEL_OPTION_DAILY_REPOSITORY_PORT)
    private readonly optionDailyRepo: ChannelOptionDailyRepositoryPort,
    @Inject(CHANNEL_TARGET_DAILY_REPOSITORY_PORT)
    private readonly targetDailyRepo: ChannelTargetDailyRepositoryPort,
    @Inject(AD_ACCOUNT_KPI_REPOSITORY_PORT)
    private readonly accountKpiRepo: AdAccountKpiRepositoryPort,
  ) {}

  createRun(input: ScrapeRunInput) {
    return this.scrapeRepo.createRun(input);
  }

  appendSnapshot(input: ScrapeSnapshotInput) {
    return this.scrapeRepo.appendSnapshot(input);
  }

  finalizeRun(input: ScrapeRunFinalize) {
    return this.scrapeRepo.finalizeRun(input);
  }

  upsertListingDaily(input: ListingDailyUpsertInput) {
    return this.listingDailyRepo.upsert(input);
  }

  upsertOptionDaily(input: ListingOptionDailyUpsertInput) {
    return this.optionDailyRepo.upsert(input);
  }

  upsertAdTargetDaily(input: UpsertAdTargetDailyInput) {
    return this.targetDailyRepo.upsert(input);
  }

  upsertAccountKpi(input: UpsertAccountKpiInput) {
    return this.accountKpiRepo.upsertAccountKpi(input);
  }
}
