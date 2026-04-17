import type { PrismaService } from '../../prisma/prisma.service';

// Mirror of WingAdSummarySchema from @kiditem/shared (packages/shared/src/schemas/dashboard.ts).
// Import from @kiditem/shared once root packages/shared dist is rebuilt with Task 1 additions.
interface WingAdSummaryBase {
  adRevenue: number;
  adSpend: number;
  adRoas: number;
  rawAdSummary?: Record<string, unknown> | null;
}

export interface WingAdSummaryResult extends WingAdSummaryBase {
  lastSyncAt: Date | null;
}

/**
 * Fetch + parse the current month's Wing adSummary snapshot.
 *
 * Source: ad_snapshots rows where source='wing', page_type='dashboard_kpi',
 * captured_at >= monthStart, raw_json.startDate == current-month-first-day,
 * raw_json.adSummary.adGmv > 0. Ordered by raw_json.period DESC (longer-span
 * snapshots win over partial/daily), then captured_at DESC. Limit 1.
 *
 * Returns null when no qualifying snapshot exists (fresh tenant / Wing sync
 * not run). Caller should treat null as "no override data" and keep their
 * base calculations.
 *
 * Extracted from dashboard.service.ts:422-447 (raw_json query + lastSyncAt
 * fetch + numeric parsing).
 */
export async function fetchWingAdSummary(
  prisma: PrismaService,
  year: number,
  month: number,
  monthStart: Date,
): Promise<WingAdSummaryResult | null> {
  const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;

  const wingAdSnapRows = await prisma.$queryRaw<{ raw_json: Record<string, unknown> }[]>`
    SELECT raw_json
    FROM ad_snapshots
    WHERE source = 'wing'
      AND page_type = 'dashboard_kpi'
      AND captured_at >= ${monthStart}
      AND raw_json->>'startDate' = ${monthStartStr}
      AND raw_json->'adSummary'->>'adGmv' IS NOT NULL
      AND (raw_json->'adSummary'->>'adGmv')::float > 0
    ORDER BY (raw_json->>'period')::int DESC, captured_at DESC
    LIMIT 1
  `;

  const rawAdSummary = wingAdSnapRows[0]?.raw_json
    ? ((wingAdSnapRows[0].raw_json as Record<string, unknown>).adSummary ?? null)
    : null;

  if (!rawAdSummary) {
    return null;
  }

  const lastSyncRow = await prisma.adSnapshot.findFirst({
    where: { source: 'wing' },
    orderBy: { capturedAt: 'desc' },
    select: { capturedAt: true },
  });

  const summary = rawAdSummary as Record<string, unknown>;
  const adRevenue = Math.round(Number(summary.adGmv) || 0);
  const adSpend = Math.round(Number(summary.adSpend) || 0);
  const adRoas = adSpend > 0
    ? Math.round((adRevenue / adSpend) * 100 * 100) / 100
    : 0;

  return {
    adRevenue,
    adSpend,
    adRoas,
    rawAdSummary: summary,
    lastSyncAt: lastSyncRow?.capturedAt ?? null,
  } satisfies WingAdSummaryResult;
}
