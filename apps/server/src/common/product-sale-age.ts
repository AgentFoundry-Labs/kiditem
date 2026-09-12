import { Prisma } from '@prisma/client';
import {
  parseProductAbcDateToKstCalendarDate,
  productAbcSaleAgeDays,
} from '@kiditem/shared/product-abc';
import type { PrismaService } from '../prisma/prisma.service';


type SaleAgeDb = PrismaService | Prisma.TransactionClient;

export type ProductSaleAgeEvidence = Readonly<{
  masterProductId: string;
  mappingValid: boolean;
  saleStartDate: string | null;
}>;

/**
 * Reads the current, organization-scoped option recipes that prove a channel
 * listing is mapped to a MasterProduct. The listing-level masterProductId is
 * deliberately not used: multi-master listings have a null summary while
 * their individual option recipes remain valid mappings.
 */
export async function readProductSaleAgeEvidence(
  db: SaleAgeDb,
  organizationId: string,
  masterProductIds: readonly string[],
  cutoffDate: string | null,
): Promise<readonly ProductSaleAgeEvidence[]> {
  const ids = [...new Set(masterProductIds)].sort();
  const evidence = new Map<string, ProductSaleAgeEvidence>(ids.map((masterProductId) => [
    masterProductId,
    { masterProductId, mappingValid: false, saleStartDate: null },
  ]));
  if (ids.length === 0) return [...evidence.values()];

  // Transaction clients are single-connection clients. Keep these reads
  // sequential when called from the repeatable product snapshot; overlapping
  // them makes PrismaPg queue one query behind another on the same client.
  const listings = await db.channelListing.findMany({
      where: {
        organizationId,
        isActive: true,
        options: {
          some: {
            organizationId,
            isActive: true,
            inventoryComponents: {
              some: {
                organizationId,
                sellpiaInventorySku: { masterProductId: { in: ids } },
              },
            },
          },
        },
      },
      select: {
        id: true,
        options: {
          where: { organizationId, isActive: true },
          select: {
            inventoryComponents: {
              where: { organizationId },
              select: {
                quantity: true,
                sellpiaInventorySku: {
                  select: {
                    isActive: true,
                    masterProductId: true,
                    masterProduct: { select: { isActive: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
  const saleAgeRaw = await readSaleAgeRaw(db, organizationId, ids);
  const rawByListingId = new Map(
    saleAgeRaw.map((row) => [row.listingId, {
      source: row.source,
      saleStartedAt: row.saleStartedAt,
    }] as const),
  );

  for (const listing of listings) {
    const hasCompleteRecipe = listing.options.length > 0
      && listing.options.every((option) => option.inventoryComponents.length > 0
        && option.inventoryComponents.every((component) =>
          component.quantity > 0
          && component.sellpiaInventorySku.isActive
          && component.sellpiaInventorySku.masterProductId !== null
          && component.sellpiaInventorySku.masterProduct?.isActive === true));
    if (!hasCompleteRecipe) continue;
    const saleStartDate = saleStartDateFromRaw(
      rawByListingId.get(listing.id) ?? null,
      cutoffDate,
    );
    for (const option of listing.options) {
      for (const component of option.inventoryComponents) {
        const sku = component.sellpiaInventorySku;
        const masterProductId = sku.masterProductId;
        if (
          component.quantity <= 0
          || !sku.isActive
          || !masterProductId
          || !sku.masterProduct?.isActive
        ) continue;
        const current = evidence.get(masterProductId);
        if (!current) continue;
        evidence.set(masterProductId, {
          masterProductId,
          mappingValid: true,
          saleStartDate: earlierDate(current.saleStartDate, saleStartDate),
        });
      }
    }
  }
  return [...evidence.values()];
}

type SaleAgeRawRow = Readonly<{
  listingId: string;
  source: Prisma.JsonValue | null;
  saleStartedAt: Prisma.JsonValue | null;
}>;

async function readSaleAgeRaw(
  db: SaleAgeDb,
  organizationId: string,
  masterProductIds: readonly string[],
): Promise<readonly SaleAgeRawRow[]> {
  return db.$queryRaw<SaleAgeRawRow[]>(Prisma.sql`
    SELECT listing.id AS "listingId",
           listing.raw_json -> 'source' AS "source",
           listing.raw_json -> 'saleStartedAt' AS "saleStartedAt"
    FROM channel_listings AS listing
    WHERE listing.organization_id = ${organizationId}::uuid
      AND listing.is_active = TRUE
      AND EXISTS (
        SELECT 1
        FROM channel_listing_options AS option
        WHERE option.organization_id = ${organizationId}::uuid
          AND option.listing_id = listing.id
          AND option.is_active = TRUE
          AND EXISTS (
            SELECT 1
            FROM channel_listing_option_inventory_components AS component
            JOIN sellpia_inventory_skus AS sku
              ON sku.id = component.sellpia_inventory_sku_id
             AND sku.organization_id = component.organization_id
            WHERE component.organization_id = ${organizationId}::uuid
              AND component.channel_listing_option_id = option.id
              AND sku.master_product_id IN (${Prisma.join(masterProductIds.map((id) => Prisma.sql`${id}::uuid`))})
          )
      )
  `);
}

/** Normalizes the provider date to a KST calendar day and rejects future/invalid input. */
export function saleStartDateFromRaw(
  rawJson: Prisma.JsonValue | null,
  cutoffDate: string | null,
): string | null {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) return null;
  const value = (rawJson as Record<string, unknown>).saleStartedAt;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const source = (rawJson as Record<string, unknown>).source;
  const allowNaiveKstTimestamp = source === 'wing_app_data'
    || source === 'coupang_catalog_details'
    || source === 'coupang_catalog_basics';
  const normalized = parseProductAbcDateToKstCalendarDate(value, {
    allowNaiveKstTimestamp,
  });
  const normalizedCutoff = cutoffDate === null
    ? null
    : parseProductAbcDateToKstCalendarDate(cutoffDate);
  if (!normalized
    || (cutoffDate !== null && (!normalizedCutoff || normalized > normalizedCutoff))) return null;
  return normalized;
}

export function saleAgeDays(
  saleStartDate: string | null,
  cutoffDate: string | null,
): number | null {
  return productAbcSaleAgeDays(saleStartDate, cutoffDate);
}

function earlierDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left <= right ? left : right;
}
