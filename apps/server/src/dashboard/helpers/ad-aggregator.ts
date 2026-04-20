import type { PrismaService } from '../../prisma/prisma.service';

export interface RangeAdMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

/**
 * Period ad aggregation (ads table raw query).
 * Extracted from dashboard.service.ts (aggregateAdForRange).
 *
 * IDOR fix (Plan D.1 T4): companyId added to signature and raw SQL WHERE clause
 * to prevent cross-tenant data leakage (ADR-0006).
 */
export async function aggregateAdForRange(
  prisma: PrismaService,
  companyId: string,
  from: Date,
  to: Date,
): Promise<RangeAdMetrics> {
  // ADR-0006 multi-tenant IDOR guard: companyId is bound via $queryRaw tagged template → $1::uuid
  // (NOT string concatenation — do not refactor to template literal)
  const agg = await prisma.$queryRaw<
    { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }[]
  >`
    SELECT
      COALESCE(SUM(spend), 0)::int AS spend,
      COALESCE(SUM(impressions), 0)::int AS impressions,
      COALESCE(SUM(clicks), 0)::int AS clicks,
      COALESCE(SUM(conversions), 0)::int AS conversions,
      COALESCE(SUM(revenue), 0)::int AS revenue
    FROM ads
    WHERE date >= ${from}::date AND date < ${to}::date
      AND company_id = ${companyId}::uuid
  `;
  return agg[0] ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
}
