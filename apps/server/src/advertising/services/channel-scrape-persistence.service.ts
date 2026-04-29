// Thin facade over the focused channels-namespace persistence helpers.
//
// The actual logic lives in `apps/server/src/advertising/adapter/out/prisma/*.ts`
// (one module per concern: scrape-run lifecycle, daily-fact upserts,
// account KPI). Ingest handlers call those persistence functions directly.
// This @Injectable wrapper exists for two reasons during the Lane A
// refactor:
//   1. Integration tests inject `ChannelScrapePersistenceService` directly
//      (`apps/server/src/advertising/__tests__/channel-scrape-dual-write.pg.integration.spec.ts`).
//   2. The existing unit test (`channel-scrape-persistence.spec.ts`)
//      constructs the service with a mocked `PrismaService` to assert the
//      atomic metaJson merge.
//
// New callers should import the persistence functions directly. This
// facade keeps the contract stable and may be removed once the broader
// refactor completes.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  appendScrapeSnapshot,
  createScrapeRun,
  finalizeScrapeRun,
  type ScrapeRunFinalize,
  type ScrapeRunInput,
  type ScrapeSnapshotInput,
} from '../adapter/out/prisma/channel-scrape-run.persistence';
import {
  upsertChannelAdTargetDaily,
  upsertChannelListingDaily,
  upsertChannelOptionDaily,
  type ListingDailyUpsertInput,
  type ListingOptionDailyUpsertInput,
  type UpsertAdTargetDailyInput,
} from '../adapter/out/prisma/channel-daily-fact.persistence';
import {
  upsertChannelAccountKpi,
  type UpsertAccountKpiInput,
} from '../adapter/out/prisma/channel-account-kpi.persistence';

// Re-export public types so existing imports against this module keep
// resolving while consumers migrate to the adapter/out/prisma/* modules.
export type { ScrapeMatchStatus } from '../domain/listing-match';
export type {
  ListingDailyState,
  ListingDailyTrafficMetrics,
  ListingOptionDailyState,
  AdTargetDailyMetrics,
} from '../adapter/out/prisma/channel-daily-fact.persistence';

@Injectable()
export class ChannelScrapePersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  createRun(input: ScrapeRunInput) {
    return createScrapeRun(this.prisma, input);
  }

  appendSnapshot(input: ScrapeSnapshotInput) {
    return appendScrapeSnapshot(this.prisma, input);
  }

  finalizeRun(input: ScrapeRunFinalize) {
    return finalizeScrapeRun(this.prisma, input);
  }

  upsertListingDaily(input: ListingDailyUpsertInput) {
    return upsertChannelListingDaily(this.prisma, input);
  }

  upsertOptionDaily(input: ListingOptionDailyUpsertInput) {
    return upsertChannelOptionDaily(this.prisma, input);
  }

  upsertAdTargetDaily(input: UpsertAdTargetDailyInput) {
    return upsertChannelAdTargetDaily(this.prisma, input);
  }

  upsertAccountKpi(input: UpsertAccountKpiInput) {
    return upsertChannelAccountKpi(this.prisma, input);
  }
}
