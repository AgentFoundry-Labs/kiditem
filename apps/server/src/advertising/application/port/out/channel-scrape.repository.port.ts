// Outgoing port for the `ChannelScrapeRun` lifecycle + advertising-side
// scrape-run status reads. Combines what used to live across
// `channel-scrape-run.persistence.ts` (write) and the in-line ad-collect
// reads inside `ad-collect.service.ts`. Both target the
// `ChannelScrapeRun` aggregate.

import type { ScrapeMatchStatus as DomainScrapeMatchStatus } from '../../../domain/listing-match';

export const CHANNEL_SCRAPE_REPOSITORY_PORT = Symbol(
  'ChannelScrapeRepositoryPort',
);

export type ScrapeMatchStatus = DomainScrapeMatchStatus;

export interface ScrapeRunInput {
  organizationId: string;
  channel: string;
  source: string;
  pageType: string;
  businessDate?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  targetUrl?: string | null;
  period?: string | null;
  parserVersion?: string | null;
  metaJson?: Record<string, unknown> | null;
}

export interface ScrapeSnapshotInput {
  scrapeRunId: string;
  organizationId: string;
  channel: string;
  source: string;
  pageType: string;
  businessDate?: Date | null;
  externalId?: string | null;
  externalOptionId?: string | null;
  listingId?: string | null;
  listingOptionId?: string | null;
  optionId?: string | null;
  matchStatus: ScrapeMatchStatus;
  matchReason?: string | null;
  rowHash?: string | null;
  rawJson: Record<string, unknown>;
  normalizedJson?: Record<string, unknown> | null;
}

export interface ScrapeRunFinalize {
  scrapeRunId: string;
  organizationId: string;
  status: 'complete' | 'error' | 'partial';
  rowCount?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  errorCount?: number;
  errorJson?: Record<string, unknown> | null;
}

export interface ScrapeRunErrorFinalize {
  scrapeRunId: string;
  organizationId: string;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  err: unknown;
}

export interface AdCollectStatusSummary {
  lastCollectedAt: Date | null;
  campaignScrapeRunCount: number;
  productScrapeRunCount: number;
}

export interface ExtensionStatusLatestListing {
  isOfferWinner: boolean | null;
  lastObservedAt: Date;
}

export interface ExtensionStatusLatestRun {
  finishedAt: Date | null;
  startedAt: Date | null;
  pageType: string | null;
}

export interface ExtensionStatusWingKpi {
  normalizedJson: Record<string, unknown> | null;
  lastObservedAt: Date | null;
}

export interface ExtensionStatusSnapshot {
  listingCount: number;
  latestPerListing: ExtensionStatusLatestListing[];
  rawSnapshotCount: number;
  latestRun: ExtensionStatusLatestRun | null;
  wingKpi: ExtensionStatusWingKpi | null;
}

export interface ChannelScrapeRepositoryPort {
  // Lifecycle writes
  createRun(input: ScrapeRunInput): Promise<{ id: string }>;
  appendSnapshot(input: ScrapeSnapshotInput): Promise<{ id: string }>;
  finalizeRun(input: ScrapeRunFinalize): Promise<void>;
  /** Best-effort error finalize; swallows secondary finalize errors. */
  finalizeRunOnError(input: ScrapeRunErrorFinalize): Promise<void>;

  // Reads — used by AdCollectService for the operations dashboard.
  findAdCollectStatus(organizationId: string): Promise<AdCollectStatusSummary>;

  /**
   * Single-pass read of every column the extension-status endpoint needs:
   * listing count, latest per-listing winner state, raw snapshot count,
   * latest run, and the wing-kpi row. Used by `AdSyncService.getExtensionStatus`.
   */
  findExtensionStatusSnapshot(
    organizationId: string,
  ): Promise<ExtensionStatusSnapshot>;
}
