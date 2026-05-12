// Fetch + parse the current month's Wing adSummary KPI snapshot for an
// organization.
//
// Source: `ChannelAccountDailyKpiSnapshot(source='wing',
// kpiType='wing_dashboard')`. Ingestion writes the wing dashboard payload
// (`kpis`, `adSummary`, `summary`, `period`, `startDate`, `endDate`,
// `timestamp`) into `normalizedJson`; we read the latest row whose
// `startDate` matches the caller-supplied month and whose `adGmv` is
// positive.
//
// Selection order (deterministic tiebreaker chain):
//   businessDate DESC, lastObservedAt DESC, id DESC
// — daily-fact upserts overwrite the same `(organizationId, channel, source,
// businessDate, kpiType)` row each scrape, so the most-recent observation
// already carries the longest-span normalized payload.
//
// Returns null when no qualifying snapshot exists for this organization.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { pct2 } from '../../../domain/util/percent';
import type {
  WingAdSummaryRepositoryPort,
  WingAdSummaryResult,
} from '../../../application/port/out/wing-ad-summary.repository.port';

@Injectable()
export class WingAdSummaryRepositoryAdapter
  implements WingAdSummaryRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async fetchCurrentMonthSummary(
    organizationId: string,
    year: number,
    month: number,
    _monthStart: Date,
  ): Promise<WingAdSummaryResult | null> {
    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;

    // Pull a small page of recent rows so we can match the caller-supplied
    // month against the snapshot's normalized `startDate`. The H2 ingest
    // stamps `startDate` from the wing payload, which can lag/lead the
    // businessDate by a day at month boundaries — we must filter on the
    // payload field, not on businessDate, to match legacy semantics. Bound
    // the scan to the last 60 days; older wing dashboard kpi rows do not
    // represent the current month.
    const sinceCutoff = new Date(year, month - 1, 1);
    sinceCutoff.setMonth(sinceCutoff.getMonth() - 1);

    const candidateRows =
      await this.prisma.channelAccountDailyKpiSnapshot.findMany({
        where: {
          organizationId,
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

    let chosen: {
      normalized: Record<string, unknown>;
      lastObservedAt: Date;
    } | null = null;
    for (const row of candidateRows) {
      const normalized =
        (row.normalizedJson as Record<string, unknown> | null) ?? null;
      if (!normalized) continue;
      if (normalized.startDate !== monthStartStr) continue;
      const adSummary = normalized.adSummary as
        | Record<string, unknown>
        | null
        | undefined;
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
    const adRoas = pct2(adRevenue, adSpend);

    return {
      adRevenue,
      adSpend,
      adRoas,
      rawAdSummary: summary,
      lastSyncAt: chosen.lastObservedAt,
    } satisfies WingAdSummaryResult;
  }
}
