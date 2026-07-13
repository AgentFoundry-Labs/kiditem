// Outgoing port for account/store-level KPI persistence + reads.
// Combines what used to live across `ad-account-kpi.query.ts` (read) and
// `channel-account-kpi.persistence.ts` (write) because both target the
// `ChannelAccountDailyKpiSnapshot` aggregate.

import type { AdMetricSums, AdPeriod } from '../../../../domain/ad-metrics';

export const AD_ACCOUNT_KPI_REPOSITORY_PORT = Symbol(
  'AdAccountKpiRepositoryPort',
);

export interface AdAccountKpiDayRow {
  businessDate: string;
  sums: AdMetricSums;
  orders: number;
}

/**
 * Idempotent upsert input. Mirrors the historical
 * `channel-account-kpi.persistence.UpsertAccountKpiInput` so the adapter
 * can keep `(organizationId, channelAccountId, source, businessDate, kpiType)` as
 * the unique key.
 */
export interface UpsertAccountKpiInput {
  organizationId: string;
  channelAccountId: string;
  channel: string;
  source: string;
  kpiType: string;
  businessDate: Date;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  /** Structured KPI payload reads consume. Adapter casts to InputJsonValue. */
  normalizedJson: Record<string, unknown>;
  /** Unmassaged provider blob for audit. Adapter handles null vs DbNull. */
  rawJson?: Record<string, unknown> | null;
  rawSnapshotId?: string | null;
  observedAt?: Date;
}

export interface AdAccountKpiRepositoryPort {
  /**
   * Read the per-day `coupang_ads_daily` rows over the period cutoff.
   * Reads recompute ratios from sums; provider ratios are not trusted.
   */
  findCoupangAdsDaily(
    organizationId: string,
    period: AdPeriod,
  ): Promise<AdAccountKpiDayRow[]>;

  /**
   * Idempotent upsert by `(organizationId, channelAccountId, source, businessDate, kpiType)`.
   * Returns the row id so callers can audit-link snapshots.
   */
  upsertAccountKpi(input: UpsertAccountKpiInput): Promise<{ id: string }>;
}
