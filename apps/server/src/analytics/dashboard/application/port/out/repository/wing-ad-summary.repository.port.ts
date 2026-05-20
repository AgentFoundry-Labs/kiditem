// Outgoing port for the current-month Wing adSummary lookup. Reads the
// latest qualifying `ChannelAccountDailyKpiSnapshot(source='wing',
// kpiType='wing_dashboard')` for the caller-supplied year/month and
// surfaces the parsed adSummary payload + lastObservedAt for sync
// metadata. Returns null when no qualifying snapshot exists.

import type { WingAdSummary } from '@kiditem/shared/dashboard';

export const WING_AD_SUMMARY_REPOSITORY_PORT = Symbol(
  'WingAdSummaryRepositoryPort',
);

export interface WingAdSummaryResult extends WingAdSummary {
  lastSyncAt: Date | null;
}

export interface WingAdSummaryRepositoryPort {
  fetchCurrentMonthSummary(
    organizationId: string,
    year: number,
    month: number,
    monthStart: Date,
  ): Promise<WingAdSummaryResult | null>;
}
