import { Prisma } from '@prisma/client';
import {
  parseProductAbcDateToKstCalendarDate,
  productAbcSaleAgeDays,
} from '@kiditem/shared/product-abc';
import type { PrismaService } from '../prisma/prisma.service';
import type { InventoryTransactionalReadPort } from '../inventory/application/port/in/stock/inventory-transactional-read.port';

export type InventorySaleAgeReader = Pick<
  InventoryTransactionalReadPort,
  'readSaleAgeMappings'
>;


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
  inventory: InventorySaleAgeReader,
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
  const listings = await inventory.readSaleAgeMappings(
    { client: db },
    organizationId,
    ids,
  );
  const saleAgeRaw = await readSaleAgeRaw(
    db,
    organizationId,
    listings.map(({ listingId }) => listingId),
  );
  const rawByListingId = new Map(
    saleAgeRaw.map((row) => [row.listingId, {
      source: row.source,
      saleStartedAt: row.saleStartedAt,
    }] as const),
  );

  for (const listing of listings) {
    const hasCompleteRecipe = listing.options.length > 0
      && listing.options.every((option) => option.components.length > 0
        && option.components.every((component) =>
          component.quantity > 0
          && component.masterProductId !== null
          && component.masterProductActive));
    if (!hasCompleteRecipe) continue;
    const saleStartDate = saleStartDateFromRaw(
      rawByListingId.get(listing.listingId) ?? null,
      cutoffDate,
    );
    for (const option of listing.options) {
      for (const component of option.components) {
        const masterProductId = component.masterProductId;
        if (
          component.quantity <= 0
          || !masterProductId
          || !component.masterProductActive
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
  listingIds: readonly string[],
): Promise<readonly SaleAgeRawRow[]> {
  if (listingIds.length === 0) return [];
  return db.$queryRaw<SaleAgeRawRow[]>(Prisma.sql`
    SELECT listing.id AS "listingId",
           listing.raw_json -> 'source' AS "source",
           listing.raw_json -> 'saleStartedAt' AS "saleStartedAt"
    FROM channel_listings AS listing
    WHERE listing.organization_id = ${organizationId}::uuid
      AND listing.is_active = TRUE
      AND listing.id IN (${Prisma.join(listingIds.map((id) => Prisma.sql`${id}::uuid`))})
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
