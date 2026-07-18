import { Prisma } from "@prisma/client";
import type { DataMigration } from "../types";

const CAMPAIGN_TARGET_META = "advertising.campaign.target";
const CONVERSION_COUNT_HEADERS = new Set([
  "광고 전환 판매수",
  "전환 판매수",
  "광고 전환수",
  "전환수",
  "conversion sales",
  "conversions",
]);

type JsonRecord = Record<string, unknown>;

export type RevenueShapedCampaignTargetCandidate = {
  id: string;
  organizationId: string;
  businessDate: Date;
  targetKey: string;
  spend: number;
  revenue: number;
  conversions: number;
  orders: number;
  adSpend: number;
  adRevenue: number;
  rawSnapshotId: string | null;
  metaJson: unknown;
};

export type CampaignTargetRawSnapshot = {
  id: string;
  organizationId: string;
  channel: string;
  source: string;
  pageType: string;
  businessDate: Date | null;
  rawJson: unknown;
  normalizedJson: unknown;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function roundedNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseObservedCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, "").trim();
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

function addExactHeaderEvidence(
  values: Set<number>,
  source: unknown,
  allowGenericEnglishHeader = true,
): void {
  for (const [header, rawValue] of Object.entries(asRecord(source))) {
    const normalizedHeader = normalizeHeader(header);
    if (!CONVERSION_COUNT_HEADERS.has(normalizedHeader)) continue;
    // A fallback rawJson can itself be a normalized row. Its generic
    // `conversions` property is the corrupted field, not independent header
    // evidence. `rawColumns` and the observed-metrics marker disambiguate it.
    if (!allowGenericEnglishHeader && normalizedHeader === "conversions") {
      continue;
    }
    const parsed = parseObservedCount(rawValue);
    if (parsed !== null) values.add(parsed);
  }
}

/**
 * Recover only values tied to an exact conversion-count header, or to the
 * newer parser's explicit `_observedMetrics.conversions=true` evidence. A
 * generic `conversions` field from the affected parser is not evidence: that
 * is the field known to have received conversion revenue.
 */
export function recoverObservedCampaignTargetConversions(
  rawSnapshot: CampaignTargetRawSnapshot,
): number | null {
  const normalized = asRecord(rawSnapshot.normalizedJson);
  const raw = asRecord(rawSnapshot.rawJson);
  const values = new Set<number>();
  addExactHeaderEvidence(values, raw, false);
  addExactHeaderEvidence(values, raw.rawColumns);
  addExactHeaderEvidence(values, normalized.rawColumns);

  const observedMetrics = asRecord(normalized._observedMetrics);
  if (observedMetrics.conversions === true) {
    const observed = parseObservedCount(normalized.conversions);
    if (observed !== null) values.add(observed);
  }

  return values.size === 1 ? [...values][0]! : null;
}

function sameDay(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

/**
 * Validate that this is exactly the known revenue-shaped parser corruption,
 * then return the independently observed conversion count. `null` means the
 * historical row is preserved because the evidence is missing or ambiguous.
 */
export function resolveRevenueShapedCampaignTargetConversion(input: {
  candidate: RevenueShapedCampaignTargetCandidate;
  rawSnapshot: CampaignTargetRawSnapshot | null;
}): number | null {
  const { candidate, rawSnapshot } = input;
  const meta = asRecord(candidate.metaJson);
  const metaKeys = Object.keys(meta);
  const normalized = asRecord(rawSnapshot?.normalizedJson);
  const rawPageType =
    typeof normalized.pageType === "string"
      ? normalized.pageType.trim()
      : null;

  if (
    candidate.conversions !== candidate.revenue ||
    candidate.conversions === candidate.orders ||
    candidate.conversions < 0 ||
    candidate.orders < 0 ||
    candidate.revenue < 0 ||
    candidate.adRevenue !== candidate.revenue ||
    candidate.adSpend !== candidate.spend ||
    !candidate.rawSnapshotId ||
    metaKeys.length !== 1 ||
    metaKeys[0] !== CAMPAIGN_TARGET_META ||
    !rawSnapshot ||
    rawSnapshot.id !== candidate.rawSnapshotId ||
    rawSnapshot.organizationId !== candidate.organizationId ||
    rawSnapshot.channel !== "coupang" ||
    rawSnapshot.source !== "advertising" ||
    rawSnapshot.pageType !== "product" ||
    rawPageType !== "product" ||
    !sameDay(rawSnapshot.businessDate, candidate.businessDate) ||
    roundedNumber(normalized.revenue) !== candidate.revenue ||
    roundedNumber(normalized.conversions) !== candidate.conversions ||
    roundedNumber(normalized.runningAdSpend ?? normalized.spend) !==
      candidate.spend
  ) {
    return null;
  }

  return recoverObservedCampaignTargetConversions(rawSnapshot);
}

export const repairAdCampaignTargetConversions: DataMigration = {
  id: "v0.1.21:003_repair_ad_campaign_target_conversions",
  releaseVersion: "0.1.21",
  name: "Repair campaign target conversions from observed count headers",
  async run(tx) {
    const candidates = await tx.$queryRaw<
      RevenueShapedCampaignTargetCandidate[]
    >(Prisma.sql`
      SELECT
        id,
        organization_id AS "organizationId",
        business_date AS "businessDate",
        target_key AS "targetKey",
        spend,
        revenue,
        conversions,
        orders,
        ad_spend AS "adSpend",
        ad_revenue AS "adRevenue",
        raw_snapshot_id AS "rawSnapshotId",
        meta_json AS "metaJson"
      FROM channel_ad_target_daily_snapshots
      WHERE channel = 'coupang'
        AND target_type = 'product'
        AND conversions = revenue
        AND conversions <> orders
        AND meta_json ? ${CAMPAIGN_TARGET_META}
      ORDER BY organization_id, business_date, target_key, id
    `);

    const repairPlan: Array<{
      candidate: RevenueShapedCampaignTargetCandidate;
      observedConversions: number;
    }> = [];
    const unresolvedCandidateIds: string[] = [];
    let alreadyObservedCount = 0;
    for (const candidate of candidates) {
      const rawSnapshot = candidate.rawSnapshotId
        ? await tx.channelScrapeSnapshot.findUnique({
            where: {
              id_organizationId: {
                id: candidate.rawSnapshotId,
                organizationId: candidate.organizationId,
              },
            },
            select: {
              id: true,
              organizationId: true,
              channel: true,
              source: true,
              pageType: true,
              businessDate: true,
              rawJson: true,
              normalizedJson: true,
            },
          })
        : null;
      const observedConversions = resolveRevenueShapedCampaignTargetConversion({
        candidate,
        rawSnapshot,
      });
      if (observedConversions === null) {
        unresolvedCandidateIds.push(candidate.id);
        continue;
      }
      if (observedConversions === candidate.conversions) {
        alreadyObservedCount += 1;
        continue;
      }

      repairPlan.push({ candidate, observedConversions });
    }

    // A succeeded data migration is never run again. Do not permanently
    // accept an active revenue-shaped fact when historical evidence cannot
    // prove its true conversion count. Throwing preserves every row through
    // the runner transaction and leaves the migration retryable after the raw
    // evidence is restored or the source day is recollected.
    if (unresolvedCandidateIds.length > 0) {
      throw new Error(
        `Advertising campaign conversion evidence is missing or ambiguous for ${unresolvedCandidateIds.length} target(s): ${unresolvedCandidateIds.join(", ")}`,
      );
    }

    let updatedCount = 0;
    for (const { candidate, observedConversions } of repairPlan) {
      const updated = await tx.channelAdTargetDailySnapshot.updateMany({
        where: {
          id: candidate.id,
          organizationId: candidate.organizationId,
          channel: "coupang",
          businessDate: candidate.businessDate,
          targetType: "product",
          targetKey: candidate.targetKey,
          spend: candidate.spend,
          revenue: candidate.revenue,
          conversions: candidate.conversions,
          orders: candidate.orders,
          adSpend: candidate.adSpend,
          adRevenue: candidate.adRevenue,
          rawSnapshotId: candidate.rawSnapshotId,
        },
        data: { conversions: observedConversions },
      });
      if (updated.count !== 1) {
        throw new Error(
          `Advertising campaign target changed during repair: ${candidate.id}`,
        );
      }
      updatedCount += 1;
    }

    return {
      affectedRows: updatedCount,
      details: {
        candidateCount: candidates.length,
        updatedCount,
        unresolvedEvidenceCount: 0,
        alreadyObservedCount,
        rawSnapshotUpdatedCount: 0,
        metaUpdatedCount: 0,
      },
    };
  },
};
