import type { PrismaService } from '../../../../../prisma/prisma.service';
import type { WingAdSummary } from '@kiditem/shared/dashboard';
import { pct2 } from '../../../helpers/percent';

export interface WingAdSummaryResult extends WingAdSummary {
  lastSyncAt: Date | null;
}

/**
 * Fetch + parse the current month's Wing adSummary KPI snapshot for a company.
 *
 * Source: `ChannelAccountDailyKpiSnapshot(source='wing',
 * kpiType='wing_dashboard')`. The ingestion writes the wing dashboard payload
 * (`kpis`, `adSummary`, `summary`, `period`, `startDate`, `endDate`,
 * `timestamp`) into `normalizedJson`; we read the latest row whose
 * `startDate` matches the caller-supplied month and whose `adGmv` is
 * positive.
 *
 * Selection order (deterministic tiebreaker chain):
 *   businessDate DESC, lastObservedAt DESC, id DESC
 * — daily-fact upserts overwrite the same `(companyId, channel, source,
 * businessDate, kpiType)` row each scrape, so the most-recent observation
 * already carries the longest-span normalized payload.
 *
 * Returns null when no qualifying snapshot exists for this company.
 *
 * Multi-tenant: `companyId` filter is part of the unique key + every where
 * clause.
 */
export async function fetchWingAdSummary(
  prisma: PrismaService,
  companyId: string,
  year: number,
  month: number,
  _monthStart: Date,
): Promise<WingAdSummaryResult | null> {
  const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;

  // Pull a small page of recent rows so we can match the caller-supplied month
  // against the snapshot's normalized `startDate`. The H2 ingest stamps
  // `startDate` from the wing payload, which can lag/lead the businessDate by
  // a day at month boundaries — we must filter on the payload field, not on
  // businessDate, to match legacy semantics. Bound the scan to the last 60
  // days; older wing dashboard kpi rows do not represent the current month.
  const sinceCutoff = new Date(year, month - 1, 1);
  sinceCutoff.setMonth(sinceCutoff.getMonth() - 1); // safety margin

  const candidateRows = await prisma.channelAccountDailyKpiSnapshot.findMany({
    where: {
      companyId,
      source: 'wing',
      kpiType: 'wing_dashboard',
      businessDate: { gte: sinceCutoff },
    },
    orderBy: [
      { businessDate: 'desc' },
      { lastObservedAt: 'desc' },
      { id: 'desc' },
    ],
    select: { normalizedJson: true, lastObservedAt: true },
    take: 30,
  });

  let chosen: { normalized: Record<string, unknown>; lastObservedAt: Date } | null = null;
  for (const row of candidateRows) {
    const normalized = (row.normalizedJson as Record<string, unknown> | null) ?? null;
    if (!normalized) continue;
    if (normalized.startDate !== monthStartStr) continue;
    const adSummary = normalized.adSummary as Record<string, unknown> | null | undefined;
    if (!adSummary) continue;
    const adGmvRaw = adSummary.adGmv;
    const adGmvNum =
      typeof adGmvRaw === 'number'
        ? adGmvRaw
        : typeof adGmvRaw === 'string'
          ? Number(adGmvRaw)
          : NaN;
    if (!Number.isFinite(adGmvNum) || adGmvNum <= 0) continue;
    chosen = { normalized, lastObservedAt: row.lastObservedAt };
    break;
  }

  if (!chosen) {
    return null;
  }

  const summary = chosen.normalized.adSummary as Record<string, unknown>;
  const adRevenue = Math.round(Number(summary.adGmv) || 0);
  const adSpend = Math.round(Number(summary.adSpend) || 0);
  // ROAS recompute from the additive numerator/denominator using the shared
  // 2-decimal percent helper (revenue / spend * 100, 2-decimal rounded, 0 when
  // spend <= 0). Same helper used 6× by dashboard-ad.service.
  const adRoas = pct2(adRevenue, adSpend);

  return {
    adRevenue,
    adSpend,
    adRoas,
    rawAdSummary: summary,
    lastSyncAt: chosen.lastObservedAt,
  } satisfies WingAdSummaryResult;
}
