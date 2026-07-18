import { Prisma } from "@prisma/client";
import type { DataMigration } from "../types";

const CONVERSION_SALES_HEADERS = new Set([
  "광고 전환 판매수",
  "전환 판매수",
  "conversion sales",
]);
const CONVERSION_ORDER_HEADERS = new Set([
  "광고 전환 주문수",
  "전환 주문수",
  "주문수",
  "orders",
]);
const PROVIDER_CONVERSION_RATE_HEADERS = new Set([
  "전환율",
  "conversion rate",
]);

type JsonRecord = Record<string, unknown>;

export type CoupangAdsDailyCampaignEvidenceRun = {
  id: string;
  organizationId: string;
  channelAccountId: string;
  channel: string;
  source: string;
  pageType: string;
  businessDate: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: string;
  metaJson: unknown;
};

type CoupangAdsDailyRawSnapshot = {
  id: string;
  organizationId: string;
  channel: string;
  source: string;
  pageType: string;
  businessDate: Date | null;
  rawJson: unknown;
  normalizedJson: unknown;
  scrapeRun: {
    id: string;
    organizationId: string;
    channelAccountId: string;
    channel: string;
    source: string;
    pageType: string;
    businessDate: Date | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    status: string;
  } | null;
};

export type CoupangAdsDailyCandidate = {
  id: string;
  organizationId: string;
  channelAccountId: string;
  businessDate: Date;
  normalizedJson: unknown;
  rawJson: unknown;
  rawSnapshotId: string | null;
  updatedAt: Date;
  rawSnapshot: CoupangAdsDailyRawSnapshot | null;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundedNonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function kpiScalar(value: unknown): unknown {
  const record = asRecord(value);
  if (!Object.hasOwn(record, "value")) return value;

  const rawValue = record.value;
  if (typeof rawValue !== "string" && typeof rawValue !== "number") {
    return null;
  }
  const unit = typeof record.unit === "string" ? record.unit.trim() : "";
  return `${rawValue}${unit}`;
}

function parseObservedCount(value: unknown): number | null {
  const scalar = kpiScalar(value);
  if (typeof scalar === "number") {
    return Number.isSafeInteger(scalar) && scalar >= 0 ? scalar : null;
  }
  if (typeof scalar !== "string") return null;
  const compact = scalar.replace(/\s+/g, "").trim();
  const match = compact.match(
    /^(\d+(?:,\d{3})*(?:\.\d+)?)(천|만|억)?(?:건|개)?$/,
  );
  if (!match) return null;
  const numeric = Number(match[1]!.replace(/,/g, ""));
  const multiplier =
    match[2] === "억"
      ? 100_000_000
      : match[2] === "만"
        ? 10_000
        : match[2] === "천"
          ? 1_000
          : 1;
  const count = numeric * multiplier;
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function parseProviderRate(value: unknown): number | null {
  const scalar = kpiScalar(value);
  if (typeof scalar === "number") {
    return Number.isFinite(scalar) && scalar >= 0 ? scalar : null;
  }
  if (typeof scalar !== "string") return null;
  const normalized = scalar.replace(/,/g, "").replace(/%/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function exactHeaderValues(
  source: unknown,
  headers: ReadonlySet<string>,
  parser: (value: unknown) => number | null,
): Set<number> {
  const values = new Set<number>();
  for (const [header, rawValue] of Object.entries(asRecord(source))) {
    if (!headers.has(normalizeHeader(header))) continue;
    const parsed = parser(rawValue);
    if (parsed !== null) values.add(parsed);
  }
  return values;
}

function oneValue(values: ReadonlySet<number>): number | null {
  return values.size === 1 ? [...values][0]! : null;
}

function sameDay(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function dateStringMatches(value: unknown, businessDate: Date): boolean {
  if (typeof value !== "string") return false;
  return value.trim().slice(0, 10) === businessDate.toISOString().slice(0, 10);
}

function conversionRate(orders: number, clicks: number): number {
  return clicks > 0 ? Math.round((orders / clicks) * 10_000) / 100 : 0;
}

function ratesEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.005;
}

function dailyRawMetricsMatch(
  rawValue: unknown,
  normalized: JsonRecord,
  businessDate: Date,
): boolean {
  const raw = asRecord(rawValue);
  const metricNames = [
    "adSpend",
    "adRevenue",
    "impressions",
    "clicks",
    "orders",
  ] as const;
  return (
    dateStringMatches(raw.date, businessDate) &&
    metricNames.every(
      (metric) =>
        roundedNonNegativeNumber(raw[metric]) ===
        roundedNonNegativeNumber(normalized[metric]),
    ) &&
    roundedNonNegativeNumber(raw.conversions) ===
      roundedNonNegativeNumber(normalized.adRevenue)
  );
}

/**
 * The affected extension wrote conversion revenue into the generic
 * `conversions` field. The raw daily row is therefore a corruption
 * fingerprint, not conversion-count evidence. It is used only to prove that
 * the KPI and its direct raw snapshot belong to the same account/day payload.
 */
export function hasExactCoupangAdsDailyRawProvenance(
  candidate: CoupangAdsDailyCandidate,
): boolean {
  const normalized = asRecord(candidate.normalizedJson);
  const snapshot = candidate.rawSnapshot;
  const run = snapshot?.scrapeRun;
  return Boolean(
    candidate.rawSnapshotId &&
      snapshot &&
      snapshot.id === candidate.rawSnapshotId &&
      snapshot.organizationId === candidate.organizationId &&
      snapshot.channel === "coupang" &&
      snapshot.source === "coupang_ads" &&
      snapshot.pageType === "dashboard_daily" &&
      sameDay(snapshot.businessDate, candidate.businessDate) &&
      run &&
      run.organizationId === candidate.organizationId &&
      run.channelAccountId === candidate.channelAccountId &&
      run.channel === "coupang" &&
      run.source === "coupang_ads" &&
      run.pageType === "dashboard_daily" &&
      run.status === "complete" &&
      sameDay(run.businessDate, candidate.businessDate) &&
      sameDay(run.periodStart, candidate.businessDate) &&
      sameDay(run.periodEnd, candidate.businessDate) &&
      dailyRawMetricsMatch(
        candidate.rawJson,
        normalized,
        candidate.businessDate,
      ) &&
      dailyRawMetricsMatch(
        snapshot.rawJson,
        normalized,
        candidate.businessDate,
      ),
  );
}

function isExactWholeAccountCampaignRun(
  run: CoupangAdsDailyCampaignEvidenceRun,
  candidate: CoupangAdsDailyCandidate,
): boolean {
  const meta = asRecord(run.metaJson);
  return (
    run.organizationId === candidate.organizationId &&
    run.channelAccountId === candidate.channelAccountId &&
    run.channel === "coupang" &&
    run.source === "advertising" &&
    run.pageType === "campaign" &&
    run.status === "complete" &&
    sameDay(run.businessDate, candidate.businessDate) &&
    sameDay(run.periodStart, candidate.businessDate) &&
    sameDay(run.periodEnd, candidate.businessDate) &&
    meta.campaignName === "_전체"
  );
}

/**
 * Recover the sales quantity only from exact `_전체` campaign KPI labels.
 * Duplicate runs are accepted when their exact sales/order values agree.
 * Missing labels, conflicting duplicates, or an order total that does not
 * match the anchored daily row make the evidence unusable.
 */
export function recoverExactCoupangAdsDailyConversions(input: {
  candidate: CoupangAdsDailyCandidate;
  campaignRuns: CoupangAdsDailyCampaignEvidenceRun[];
}): number | null {
  const { candidate } = input;
  const normalized = asRecord(candidate.normalizedJson);
  const orders = roundedNonNegativeNumber(normalized.orders);
  const clicks = roundedNonNegativeNumber(normalized.clicks);
  const providerConversionRate = finiteNumber(
    normalized.providerConversionRate,
  );
  if (
    orders === null ||
    clicks === null ||
    providerConversionRate === null ||
    !hasExactCoupangAdsDailyRawProvenance(candidate)
  ) {
    return null;
  }

  const runs = input.campaignRuns.filter((run) =>
    isExactWholeAccountCampaignRun(run, candidate),
  );
  if (runs.length === 0) return null;

  const observedSales = new Set<number>();
  const observedOrders = new Set<number>();
  const observedProviderRates = new Set<number>();
  for (const run of runs) {
    const kpis = asRecord(asRecord(run.metaJson).kpis);
    const runSales = oneValue(
      exactHeaderValues(kpis, CONVERSION_SALES_HEADERS, parseObservedCount),
    );
    const runOrders = oneValue(
      exactHeaderValues(kpis, CONVERSION_ORDER_HEADERS, parseObservedCount),
    );
    if (runSales === null || runOrders === null) return null;
    observedSales.add(runSales);
    observedOrders.add(runOrders);

    const rateValues = exactHeaderValues(
      kpis,
      PROVIDER_CONVERSION_RATE_HEADERS,
      parseProviderRate,
    );
    if (rateValues.size > 1) return null;
    const runRate = oneValue(rateValues);
    if (runRate !== null) observedProviderRates.add(runRate);
  }

  const conversions = oneValue(observedSales);
  const observedOrderCount = oneValue(observedOrders);
  if (conversions === null || observedOrderCount !== orders) return null;
  if (observedProviderRates.size > 1) return null;

  // Coupang's displayed provider CVR is order-count / clicks, not sales
  // quantity / clicks. Preserve it; merely verify it against either the exact
  // KPI widget or the order-based calculation before repairing conversions.
  const exactProviderRate = oneValue(observedProviderRates);
  const expectedProviderRate = conversionRate(orders, clicks);
  if (
    exactProviderRate !== null
      ? !ratesEqual(providerConversionRate, exactProviderRate)
      : !ratesEqual(providerConversionRate, expectedProviderRate)
  ) {
    return null;
  }

  return conversions;
}

export function repairCoupangAdsDailyNormalizedJson(
  value: unknown,
  observedConversions: number,
): { changed: boolean; normalizedJson: JsonRecord } | null {
  const normalizedJson = asRecord(value);
  const adRevenue = roundedNonNegativeNumber(normalizedJson.adRevenue);
  const conversions = roundedNonNegativeNumber(normalizedJson.conversions);
  const orders = roundedNonNegativeNumber(normalizedJson.orders);
  const clicks = roundedNonNegativeNumber(normalizedJson.clicks);
  if (
    adRevenue === null ||
    conversions === null ||
    orders === null ||
    clicks === null ||
    !Number.isSafeInteger(observedConversions) ||
    observedConversions < 0
  ) {
    return null;
  }

  if (conversions === observedConversions) {
    return { changed: false, normalizedJson };
  }
  return {
    changed: true,
    normalizedJson: {
      ...normalizedJson,
      conversions: observedConversions,
    },
  };
}

function potentiallyCorrupted(candidate: CoupangAdsDailyCandidate): boolean {
  const normalized = asRecord(candidate.normalizedJson);
  const conversions = roundedNonNegativeNumber(normalized.conversions);
  const adRevenue = roundedNonNegativeNumber(normalized.adRevenue);
  const orders = roundedNonNegativeNumber(normalized.orders);
  const rawConversions = roundedNonNegativeNumber(
    asRecord(candidate.rawJson).conversions,
  );
  const snapshotConversions = roundedNonNegativeNumber(
    asRecord(candidate.rawSnapshot?.rawJson).conversions,
  );
  return (
    conversions === null ||
    adRevenue === null ||
    orders === null ||
    conversions === adRevenue ||
    conversions === orders ||
    rawConversions === adRevenue ||
    snapshotConversions === adRevenue
  );
}

function evidenceScopeKey(
  organizationId: string,
  channelAccountId: string,
  businessDate: Date,
): string {
  return `${organizationId}\u0000${channelAccountId}\u0000${businessDate.toISOString().slice(0, 10)}`;
}

export const repairCoupangAdsDailyConversions: DataMigration = {
  id: "v0.1.21:002_repair_coupang_ads_daily_conversions",
  releaseVersion: "0.1.21",
  name: "Repair Coupang ads daily conversions from exact sales evidence",
  async run(tx) {
    const rows = await tx.channelAccountDailyKpiSnapshot.findMany({
      where: {
        channel: "coupang",
        source: "coupang_ads",
        kpiType: "coupang_ads_daily",
      },
      orderBy: [
        { organizationId: "asc" },
        { channelAccountId: "asc" },
        { businessDate: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        organizationId: true,
        channelAccountId: true,
        businessDate: true,
        normalizedJson: true,
        rawJson: true,
        rawSnapshotId: true,
        updatedAt: true,
        rawSnapshot: {
          select: {
            id: true,
            organizationId: true,
            channel: true,
            source: true,
            pageType: true,
            businessDate: true,
            rawJson: true,
            normalizedJson: true,
            scrapeRun: {
              select: {
                id: true,
                organizationId: true,
                channelAccountId: true,
                channel: true,
                source: true,
                pageType: true,
                businessDate: true,
                periodStart: true,
                periodEnd: true,
                status: true,
              },
            },
          },
        },
      },
    });

    const evidenceScopes = new Map<
      string,
      { organizationId: string; channelAccountId: string; businessDate: Date }
    >();
    for (const row of rows) {
      evidenceScopes.set(
        evidenceScopeKey(
          row.organizationId,
          row.channelAccountId,
          row.businessDate,
        ),
        {
          organizationId: row.organizationId,
          channelAccountId: row.channelAccountId,
          businessDate: row.businessDate,
        },
      );
    }

    const campaignRuns =
      evidenceScopes.size > 0
        ? await tx.channelScrapeRun.findMany({
            where: {
              channel: "coupang",
              source: "advertising",
              pageType: "campaign",
              status: "complete",
              OR: [...evidenceScopes.values()],
            },
            orderBy: [
              { organizationId: "asc" },
              { channelAccountId: "asc" },
              { businessDate: "asc" },
              { id: "asc" },
            ],
            select: {
              id: true,
              organizationId: true,
              channelAccountId: true,
              channel: true,
              source: true,
              pageType: true,
              businessDate: true,
              periodStart: true,
              periodEnd: true,
              status: true,
              metaJson: true,
            },
          })
        : [];

    const campaignRunsByScope = new Map<
      string,
      CoupangAdsDailyCampaignEvidenceRun[]
    >();
    for (const run of campaignRuns) {
      if (!run.businessDate) continue;
      const key = evidenceScopeKey(
        run.organizationId,
        run.channelAccountId,
        run.businessDate,
      );
      const existing = campaignRunsByScope.get(key) ?? [];
      existing.push(run);
      campaignRunsByScope.set(key, existing);
    }

    const repairPlan: Array<{
      candidate: CoupangAdsDailyCandidate;
      normalizedJson: JsonRecord;
    }> = [];
    const unresolvedCandidateIds: string[] = [];
    let alreadyExactCount = 0;
    for (const row of rows) {
      const candidate = row as CoupangAdsDailyCandidate;
      const runs =
        campaignRunsByScope.get(
          evidenceScopeKey(
            row.organizationId,
            row.channelAccountId,
            row.businessDate,
          ),
        ) ?? [];
      const observedConversions = recoverExactCoupangAdsDailyConversions({
        candidate,
        campaignRuns: runs,
      });
      if (observedConversions === null) {
        if (potentiallyCorrupted(candidate)) {
          unresolvedCandidateIds.push(row.id);
        }
        continue;
      }

      const repaired = repairCoupangAdsDailyNormalizedJson(
        row.normalizedJson,
        observedConversions,
      );
      if (!repaired) {
        unresolvedCandidateIds.push(row.id);
      } else if (!repaired.changed) {
        alreadyExactCount += 1;
      } else {
        repairPlan.push({ candidate, normalizedJson: repaired.normalizedJson });
      }
    }

    // Data migrations marked successful are never rerun. Resolve every known
    // corrupted row before making the first write so an incomplete evidence
    // set cannot permanently commit a partially repaired history.
    if (unresolvedCandidateIds.length > 0) {
      throw new Error(
        `Coupang ads daily conversion evidence is missing or ambiguous for ${unresolvedCandidateIds.length} KPI row(s): ${unresolvedCandidateIds.join(", ")}`,
      );
    }

    let updatedCount = 0;
    for (const { candidate, normalizedJson } of repairPlan) {
      const updated = await tx.channelAccountDailyKpiSnapshot.updateMany({
        where: {
          id: candidate.id,
          organizationId: candidate.organizationId,
          channelAccountId: candidate.channelAccountId,
          channel: "coupang",
          source: "coupang_ads",
          kpiType: "coupang_ads_daily",
          businessDate: candidate.businessDate,
          rawSnapshotId: candidate.rawSnapshotId,
          updatedAt: candidate.updatedAt,
        },
        data: {
          normalizedJson: normalizedJson as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) {
        throw new Error(
          `Coupang ads daily KPI changed during repair: ${candidate.id}`,
        );
      }
      updatedCount += 1;
    }

    return {
      affectedRows: updatedCount,
      details: {
        scannedCount: rows.length,
        evidenceRunCount: campaignRuns.length,
        updatedCount,
        alreadyExactCount,
        unresolvedEvidenceCount: 0,
        rawJsonUpdatedCount: 0,
      },
    };
  },
};
