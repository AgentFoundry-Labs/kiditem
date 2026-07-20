import { Prisma } from "@prisma/client";
import type { DataMigration } from "../types";

const CAMPAIGN_TARGET_META = "advertising.campaign.target";

type JsonRecord = Record<string, unknown>;

export type LegacyCampaignProductTarget = {
  id: string;
  organizationId: string;
  businessDate: Date;
  targetKey: string;
  listingId: string | null;
  externalId: string | null;
  externalOptionId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  rawSnapshotId: string | null;
  metaJson: unknown;
  updatedAt: Date;
};

type ProductTargetKeys = {
  campaignAnchor: string;
  productAnchor: string;
  legacyKey: string;
  qualifiedKey: string;
};

type RawProductCampaignEvidence = {
  id: string;
  organizationId: string;
  businessDate: Date | null;
  externalId: string | null;
  externalOptionId: string | null;
  listingId: string | null;
  listing?: { externalId: string } | null;
  listingOption?: { externalOptionId: string } | null;
  normalizedJson: unknown;
  scrapeRun: {
    businessDate: Date | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    period: string | null;
    status: string;
    metaJson: unknown;
  } | null;
};

type ExistingQualifiedProductTarget = {
  id: string;
  targetKey: string;
  listingId: string | null;
  externalId: string | null;
  externalOptionId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  metaJson: unknown;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function sameDay(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function projectionKey(parts: string[]): string {
  return parts.join("\u0000");
}

export function buildCampaignQualifiedProductTargetKeys(input: {
  campaignId: string | null;
  campaignName: string | null;
  externalOptionId: string | null;
  externalId: string | null;
  listingId: string | null;
}): ProductTargetKeys {
  const campaignAnchor =
    cleanString(input.campaignId) ?? cleanString(input.campaignName);
  const productAnchor =
    cleanString(input.externalOptionId) ??
    cleanString(input.externalId) ??
    cleanString(input.listingId);
  if (!campaignAnchor) {
    throw new Error("Campaign product target has no campaign identity");
  }
  if (!productAnchor) {
    throw new Error("Campaign product target has no product identity");
  }
  return {
    campaignAnchor,
    productAnchor,
    legacyKey: `product:${productAnchor}`,
    qualifiedKey: `product:${campaignAnchor}:${productAnchor}`,
  };
}

function rawCampaignAnchor(row: RawProductCampaignEvidence): string {
  const normalized = asRecord(row.normalizedJson);
  const runMeta = asRecord(row.scrapeRun?.metaJson);
  return (
    cleanString(normalized.campaignId) ??
    cleanString(normalized.campaignName) ??
    cleanString(runMeta.campaignName) ??
    "_전체"
  );
}

function rawProductAnchor(row: RawProductCampaignEvidence): string | null {
  return (
    cleanString(row.externalOptionId) ??
    cleanString(row.listingOption?.externalOptionId) ??
    cleanString(row.externalId) ??
    cleanString(row.listing?.externalId) ??
    cleanString(row.listingId)
  );
}

function isDailyProjectionEvidence(row: RawProductCampaignEvidence): boolean {
  const run = row.scrapeRun;
  return Boolean(
    row.businessDate &&
      run &&
      run.status === "complete" &&
      run.period === "1d" &&
      sameDay(run.businessDate, row.businessDate) &&
      sameDay(run.periodStart, row.businessDate) &&
      sameDay(run.periodEnd, row.businessDate),
  );
}

export const rekeyAdCampaignProductTargets: DataMigration = {
  id: "v0.1.25:004_rekey_ad_campaign_product_targets",
  releaseVersion: "0.1.25",
  name: "Rekey Coupang campaign product targets by campaign identity",
  async run(tx) {
    const rows = await tx.$queryRaw<LegacyCampaignProductTarget[]>(Prisma.sql`
      SELECT
        id,
        organization_id AS "organizationId",
        business_date AS "businessDate",
        target_key AS "targetKey",
        listing_id AS "listingId",
        external_id AS "externalId",
        external_option_id AS "externalOptionId",
        campaign_id AS "campaignId",
        campaign_name AS "campaignName",
        raw_snapshot_id AS "rawSnapshotId",
        meta_json AS "metaJson",
        updated_at AS "updatedAt"
      FROM channel_ad_target_daily_snapshots
      WHERE channel = 'coupang'
        AND target_type = 'product'
        AND meta_json ? ${CAMPAIGN_TARGET_META}
      ORDER BY organization_id, business_date, target_key, id
    `);

    const candidates: Array<
      LegacyCampaignProductTarget & { keys: ProductTargetKeys }
    > = [];
    let skippedUnsafeKeyCount = 0;
    for (const row of rows) {
      let keys: ProductTargetKeys;
      try {
        keys = buildCampaignQualifiedProductTargetKeys(row);
      } catch {
        skippedUnsafeKeyCount += 1;
        continue;
      }
      if (row.targetKey === keys.qualifiedKey) continue;
      if (
        row.targetKey !== keys.legacyKey ||
        Object.keys(asRecord(row.metaJson)).length !== 1
      ) {
        skippedUnsafeKeyCount += 1;
        continue;
      }
      candidates.push({ ...row, keys });
    }

    if (skippedUnsafeKeyCount > 0) {
      throw new Error(
        `Unsafe campaign product target identity/key for ${skippedUnsafeKeyCount} row(s)`,
      );
    }

    if (candidates.length === 0) {
      return {
        affectedRows: 0,
        details: {
          scannedCount: rows.length,
          candidateCount: 0,
          updatedCount: 0,
          skippedUnsafeKeyCount,
          skippedDuplicateDestinationCount: 0,
          skippedExistingDestinationCount: 0,
          skippedAmbiguousEvidenceCount: 0,
          mergedExistingDestinationCount: 0,
          reparentedActionCount: 0,
          rawSnapshotUpdatedCount: 0,
          metaUpdatedCount: 0,
        },
      };
    }

    const candidatesByDestination = new Map<
      string,
      Array<(typeof candidates)[number]>
    >();
    for (const candidate of candidates) {
      const destinationKey = projectionKey([
        candidate.organizationId,
        dateKey(candidate.businessDate),
        candidate.keys.qualifiedKey,
      ]);
      const group = candidatesByDestination.get(destinationKey) ?? [];
      group.push(candidate);
      candidatesByDestination.set(destinationKey, group);
    }

    const duplicateIds = new Set(
      [...candidatesByDestination.values()]
        .filter((group) => group.length > 1)
        .flatMap((group) => group.map((candidate) => candidate.id)),
    );
    const skippedDuplicateDestinationCount = duplicateIds.size;
    if (skippedDuplicateDestinationCount > 0) {
      throw new Error(
        `Multiple legacy campaign product targets resolve to ${skippedDuplicateDestinationCount} duplicate destination row(s)`,
      );
    }

    const existingDestinationByCandidateId = new Map<
      string,
      ExistingQualifiedProductTarget
    >();
    for (const candidate of candidates) {
      const existing = await tx.channelAdTargetDailySnapshot.findUnique({
        where: {
          organizationId_channel_businessDate_targetType_targetKey: {
            organizationId: candidate.organizationId,
            channel: "coupang",
            businessDate: candidate.businessDate,
            targetType: "product",
            targetKey: candidate.keys.qualifiedKey,
          },
        },
        select: {
          id: true,
          targetKey: true,
          listingId: true,
          externalId: true,
          externalOptionId: true,
          campaignId: true,
          campaignName: true,
          metaJson: true,
        },
      });
      if (existing) {
        let existingKeys: ProductTargetKeys | null = null;
        try {
          existingKeys = buildCampaignQualifiedProductTargetKeys(existing);
        } catch {
          existingKeys = null;
        }
        if (
          !existingKeys ||
          existing.targetKey !== candidate.keys.qualifiedKey ||
          existingKeys.qualifiedKey !== candidate.keys.qualifiedKey ||
          Object.keys(asRecord(existing.metaJson)).length !== 1 ||
          !Object.hasOwn(asRecord(existing.metaJson), CAMPAIGN_TARGET_META)
        ) {
          throw new Error(
            `Unsafe existing campaign product target destination: ${existing.id}`,
          );
        }
        existingDestinationByCandidateId.set(candidate.id, existing);
      }
    }

    const organizationDatePairs = [
      ...new Map(
        candidates.map((candidate) => [
          projectionKey([
            candidate.organizationId,
            dateKey(candidate.businessDate),
          ]),
          {
            organizationId: candidate.organizationId,
            businessDate: candidate.businessDate,
          },
        ]),
      ).values(),
    ];
    const rawRows =
      organizationDatePairs.length > 0
        ? await tx.channelScrapeSnapshot.findMany({
            where: {
              channel: "coupang",
              source: "advertising",
              pageType: "product",
              OR: organizationDatePairs,
            },
            select: {
              id: true,
              organizationId: true,
              businessDate: true,
              externalId: true,
              externalOptionId: true,
              listingId: true,
              listing: { select: { externalId: true } },
              listingOption: { select: { externalOptionId: true } },
              normalizedJson: true,
              scrapeRun: {
                select: {
                  businessDate: true,
                  periodStart: true,
                  periodEnd: true,
                  period: true,
                  status: true,
                  metaJson: true,
                },
              },
            },
          })
        : [];
    const safeRawRows = rawRows.filter(isDailyProjectionEvidence);
    const rawRowById = new Map(safeRawRows.map((row) => [row.id, row]));
    const campaignsByProductDate = new Map<string, Set<string>>();
    for (const rawRow of safeRawRows) {
      const productAnchor = rawProductAnchor(rawRow);
      if (!productAnchor || !rawRow.businessDate) continue;
      const key = projectionKey([
        rawRow.organizationId,
        dateKey(rawRow.businessDate),
        productAnchor,
      ]);
      const campaigns = campaignsByProductDate.get(key) ?? new Set<string>();
      campaigns.add(rawCampaignAnchor(rawRow));
      campaignsByProductDate.set(key, campaigns);
    }

    const safeCandidates: typeof candidates = [];
    const ambiguousEvidenceCandidateIds: string[] = [];
    for (const candidate of candidates) {
      const evidenceKey = projectionKey([
        candidate.organizationId,
        dateKey(candidate.businessDate),
        candidate.keys.productAnchor,
      ]);
      const campaigns = campaignsByProductDate.get(evidenceKey);
      const linkedRaw = candidate.rawSnapshotId
        ? rawRowById.get(candidate.rawSnapshotId)
        : null;
      const linkedEvidenceMatches = Boolean(
        linkedRaw &&
          linkedRaw.organizationId === candidate.organizationId &&
          sameDay(linkedRaw.businessDate, candidate.businessDate) &&
          rawProductAnchor(linkedRaw) === candidate.keys.productAnchor &&
          rawCampaignAnchor(linkedRaw) === candidate.keys.campaignAnchor,
      );
      const singleCampaignEvidence = Boolean(
        !candidate.rawSnapshotId &&
          campaigns &&
          campaigns.size === 1 &&
          campaigns.has(candidate.keys.campaignAnchor),
      );
      // A multi-campaign product/day is not itself an error. The legacy row
      // can be qualified when its rawSnapshotId ties it to one campaign. An
      // unresolved row fails the transaction below so it cannot be silently
      // stranded by a permanently succeeded migration.
      if (!linkedEvidenceMatches && !singleCampaignEvidence) {
        ambiguousEvidenceCandidateIds.push(candidate.id);
        continue;
      }
      safeCandidates.push(candidate);
    }

    if (ambiguousEvidenceCandidateIds.length > 0) {
      throw new Error(
        `Campaign product target raw evidence is missing or ambiguous for ${ambiguousEvidenceCandidateIds.length} row(s): ${ambiguousEvidenceCandidateIds.join(", ")}`,
      );
    }

    let updatedCount = 0;
    let mergedExistingDestinationCount = 0;
    let reparentedActionCount = 0;
    for (const candidate of safeCandidates) {
      const existing = existingDestinationByCandidateId.get(candidate.id);
      if (existing) {
        const reparented = await tx.adAction.updateMany({
          where: {
            organizationId: candidate.organizationId,
            adTargetDailyId: candidate.id,
          },
          data: { adTargetDailyId: existing.id },
        });
        const deleted = await tx.channelAdTargetDailySnapshot.deleteMany({
          where: {
            id: candidate.id,
            organizationId: candidate.organizationId,
            channel: "coupang",
            businessDate: candidate.businessDate,
            targetType: "product",
            targetKey: candidate.keys.legacyKey,
            listingId: candidate.listingId,
            externalId: candidate.externalId,
            externalOptionId: candidate.externalOptionId,
            campaignId: candidate.campaignId,
            campaignName: candidate.campaignName,
            rawSnapshotId: candidate.rawSnapshotId,
            updatedAt: candidate.updatedAt,
          },
        });
        if (deleted.count !== 1) {
          throw new Error(
            `Campaign product target changed during destination merge: ${candidate.id}`,
          );
        }
        reparentedActionCount += reparented.count;
        mergedExistingDestinationCount += 1;
        continue;
      }

      const updated = await tx.channelAdTargetDailySnapshot.updateMany({
        where: {
          id: candidate.id,
          organizationId: candidate.organizationId,
          channel: "coupang",
          businessDate: candidate.businessDate,
          targetType: "product",
          targetKey: candidate.keys.legacyKey,
          listingId: candidate.listingId,
          externalId: candidate.externalId,
          externalOptionId: candidate.externalOptionId,
          campaignId: candidate.campaignId,
          campaignName: candidate.campaignName,
          rawSnapshotId: candidate.rawSnapshotId,
          updatedAt: candidate.updatedAt,
        },
        data: { targetKey: candidate.keys.qualifiedKey },
      });
      if (updated.count !== 1) {
        throw new Error(
          `Campaign product target changed during rekey: ${candidate.id}`,
        );
      }
      updatedCount += 1;
    }

    return {
      affectedRows:
        updatedCount + mergedExistingDestinationCount + reparentedActionCount,
      details: {
        scannedCount: rows.length,
        candidateCount: candidates.length,
        updatedCount,
        skippedUnsafeKeyCount,
        skippedDuplicateDestinationCount,
        skippedExistingDestinationCount: 0,
        skippedAmbiguousEvidenceCount: 0,
        mergedExistingDestinationCount,
        reparentedActionCount,
        rawSnapshotUpdatedCount: 0,
        metaUpdatedCount: 0,
      },
    };
  },
};
