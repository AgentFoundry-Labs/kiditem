import { Prisma } from '@prisma/client';
import {
  InventoryAvailabilityBatchSchema,
  type InventoryAvailabilityBatch,
} from '@kiditem/shared/inventory-availability';
import {
  isSourceImportStatus,
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
} from '@kiditem/shared/source-import';
import {
  SellpiaInventoryQualityReportSchema,
  SellpiaInventoryStoredCollectionTriggerSchema,
} from '@kiditem/shared/sellpia-inventory-freshness';
import {
  assertSellpiaInventoryLockCovers,
  type SellpiaInventoryLock,
} from '../transaction/sellpia-inventory-lock';
import type {
  InventoryAvailabilityCandidate,
  InventoryAvailabilityQuery,
  InventoryItem,
  InventoryMatchingCandidate,
  InventorySaleAgeMapping,
  InventorySkuIdentityQuery,
  InventorySkuSnapshotQuery,
  InventorySkuSnapshotRow,
  SellpiaImportRunRow,
  SellpiaInventorySkuReadModel,
} from '../../../../domain/inventory-item';

export type {
  InventoryAvailabilityCandidate,
  InventoryItem,
  InventoryMatchingCandidate,
  InventorySaleAgeMapping,
  InventorySkuSnapshotQuery,
  InventorySkuSnapshotRow,
  SellpiaImportRunRow,
  SellpiaInventorySkuReadModel,
};

const SELLPIA_INVENTORY_SKU_IDENTITY_SELECT = {
  id: true,
  code: true,
  name: true,
  optionName: true,
  barcode: true,
  purchasePrice: true,
  salePrice: true,
  isActive: true,
  masterProductId: true,
} as const;

type SelectedSellpiaInventorySkuIdentity =
  Prisma.SellpiaInventorySkuGetPayload<{
    select: typeof SELLPIA_INVENTORY_SKU_IDENTITY_SELECT;
  }>;

type InventorySkuIdentityStore = Pick<
  Prisma.TransactionClient,
  'sellpiaInventorySku' | 'channelListing' | '$queryRaw'
>;

export type InventoryAvailabilityReaderInput = InventoryAvailabilityQuery;

const INVENTORY_SNAPSHOT_SELECT = {
  id: true,
  code: true,
  name: true,
  optionName: true,
  barcode: true,
  currentStock: true,
  purchasePrice: true,
  salePrice: true,
  isActive: true,
  lastImportRunId: true,
} as const;

const INVENTORY_IMPORT_RUN_SELECT = {
  id: true,
  fileName: true,
  fileHash: true,
  status: true,
  rowCount: true,
  importedAt: true,
  lastVerifiedAt: true,
  verificationCount: true,
  lastTrigger: true,
  freshnessGeneration: true,
  manualFreshExportConfirmedAt: true,
  manualFreshExportConfirmedBy: true,
  qualityReport: true,
  errorCode: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

type InventorySummaryRow = {
  totalSkus: bigint;
  linkedSkus: bigint;
  unlinkedSkus: bigint;
  inStockSkus: bigint;
  outOfStockSkus: bigint;
  totalUnits: bigint;
  pricedAssetValue: bigint;
  unpricedSkuCount: bigint;
};

/**
 * Inventory's transaction-aware fact reader. Every availability consumer gets
 * the same organization, completed-run, and row-publication fences from here.
 * The caller holds the Sellpia inventory lock (`lockSellpiaInventory`) in `tx`
 * for the organization, so the read cannot interleave with a publication.
 */
export async function readInventoryAvailability(
  tx: Prisma.TransactionClient,
  lock: SellpiaInventoryLock,
  input: InventoryAvailabilityReaderInput,
): Promise<InventoryAvailabilityBatch> {
  assertSellpiaInventoryLockCovers(lock, tx, input.organizationId);
  const inventorySkus = await loadInventorySkus(
    tx,
    input.organizationId,
    input.sellpiaInventorySkuIds,
  );
  const basis = await loadPublishedInventoryBasis(tx, input.organizationId);
  return InventoryAvailabilityBatchSchema.parse({
    snapshot: {
      collected: basis !== null,
      generation: basis?.generation ?? null,
      verifiedAt: basis?.verifiedAt.toISOString() ?? null,
    },
    items: inventorySkus.map((sku) => ({
      sellpiaInventorySkuId: sku.id,
      currentStock: sku.currentStock,
      generation: basis?.generation ?? null,
    })),
  });
}

/**
 * Active matching identities with nullable stock from the published generation,
 * under the caller's Sellpia inventory lock.
 */
export async function readActiveInventoryMatchingCandidates(
  tx: Prisma.TransactionClient,
  lock: SellpiaInventoryLock,
  organizationId: string,
): Promise<InventoryMatchingCandidate[]> {
  assertSellpiaInventoryLockCovers(lock, tx, organizationId);
  const identities = await readInventorySkuIdentities(tx, {
    organizationId,
    selector: { kind: 'all' },
  });
  const availability = await readInventoryAvailability(tx, lock, {
    organizationId,
    sellpiaInventorySkuIds: identities.map(
      (identity) => identity.sellpiaInventorySkuId,
    ),
  });
  const availabilityBySkuId = new Map(
    availability.items.map((item) => [item.sellpiaInventorySkuId, item]),
  );
  return identities.map((identity) => {
    const stock = availabilityBySkuId.get(identity.sellpiaInventorySkuId);
    return {
      id: identity.sellpiaInventorySkuId,
      code: identity.code,
      name: identity.name,
      optionName: identity.optionName,
      barcode: identity.barcode,
      masterProductId: identity.masterProductId,
      currentStock: stock?.currentStock ?? null,
    };
  });
}

/**
 * Availability-aware candidate search under the caller's Sellpia inventory
 * lock. The published-run predicate is applied before the result limit so an
 * earlier out-of-stock row cannot hide a later in-stock candidate.
 */
export async function readInventoryAvailabilityCandidates(
  tx: Prisma.TransactionClient,
  lock: SellpiaInventoryLock,
  input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  },
): Promise<InventoryAvailabilityCandidate[]> {
  assertSellpiaInventoryLockCovers(lock, tx, input.organizationId);
  const rows = await tx.sellpiaInventorySku.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.stockStatus === 'in_stock'
        ? { currentStock: { gt: 0 } }
        : {}),
      OR: [
        { code: { contains: input.query, mode: 'insensitive' } },
        { name: { contains: input.query, mode: 'insensitive' } },
        { optionName: { contains: input.query, mode: 'insensitive' } },
        { barcode: { contains: input.query, mode: 'insensitive' } },
      ],
    },
    select: {
      ...SELLPIA_INVENTORY_SKU_IDENTITY_SELECT,
      currentStock: true,
      lastImportRunId: true,
    },
    orderBy: [{ code: 'asc' }, { id: 'asc' }],
    take: input.limit,
  });
  return rows.map((row) => ({
    sellpiaInventorySkuId: row.id,
    code: row.code,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    currentStock: row.currentStock,
  }));
}

/** Published inventory snapshot rows for the stock operations screen. */
export async function readInventorySkuSnapshotList(
  tx: Prisma.TransactionClient,
  organizationId: string,
  query: InventorySkuSnapshotQuery,
) {
  const latestImport = await readPublishedInventoryImport(tx, organizationId);
  const linkedSkuIds = await readLinkedInventorySkuIds(
    tx,
    organizationId,
    query.linkStatus,
  );
  const where = inventorySnapshotWhere(organizationId, query, linkedSkuIds);
  const [rows, total, summaryRows] = await Promise.all([
    tx.sellpiaInventorySku.findMany({
      where,
      select: inventorySnapshotDetailSelect(organizationId),
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      skip: query.skip,
      ...(query.take === undefined ? {} : { take: query.take }),
    }),
    tx.sellpiaInventorySku.count({ where }),
    tx.$queryRaw<InventorySummaryRow[]>`
      SELECT
        COUNT(*)::bigint AS "totalSkus",
        COUNT(*) FILTER (WHERE current_stock > 0)::bigint AS "inStockSkus",
        COUNT(*) FILTER (WHERE current_stock = 0)::bigint AS "outOfStockSkus",
        COALESCE(SUM(current_stock), 0)::bigint AS "totalUnits",
        COALESCE(
          SUM(current_stock::bigint * purchase_price::bigint)
            FILTER (WHERE purchase_price IS NOT NULL),
          0
        )::bigint AS "pricedAssetValue",
        COUNT(*) FILTER (WHERE purchase_price IS NULL)::bigint AS "unpricedSkuCount",
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM channel_listing_option_inventory_components component
          INNER JOIN channel_listing_options option
            ON option.id = component.channel_listing_option_id
            AND option.organization_id = ${organizationId}::uuid
            AND option.is_active = TRUE
          INNER JOIN channel_listings listing
            ON listing.id = option.listing_id
            AND listing.organization_id = ${organizationId}::uuid
            AND listing.is_active = TRUE
            AND listing.master_product_id IS NOT NULL
          WHERE component.organization_id = ${organizationId}::uuid
            AND component.sellpia_inventory_sku_id = sku.id
        ))::bigint AS "linkedSkus",
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1
          FROM channel_listing_option_inventory_components component
          INNER JOIN channel_listing_options option
            ON option.id = component.channel_listing_option_id
            AND option.organization_id = ${organizationId}::uuid
            AND option.is_active = TRUE
          INNER JOIN channel_listings listing
            ON listing.id = option.listing_id
            AND listing.organization_id = ${organizationId}::uuid
            AND listing.is_active = TRUE
            AND listing.master_product_id IS NOT NULL
          WHERE component.organization_id = ${organizationId}::uuid
            AND component.sellpia_inventory_sku_id = sku.id
        ))::bigint AS "unlinkedSkus"
      FROM sellpia_inventory_skus sku
      WHERE sku.organization_id = ${organizationId}::uuid

    `,
  ]);
  const destinationsBySkuId = await readInventoryLinkedDestinations(
    tx,
    organizationId,
    rows.map((row) => row.id),
  );
  const summary = summaryRows[0] ?? inventoryEmptySummaryRow();
  return {
    rows: rows.map((row): InventorySkuSnapshotRow => {
      const { linkedProducts, linkedChannelOptions } =
        inventoryLinkedDestinations(
          destinationsBySkuId.get(row.id) ?? [],
        );
      return {
        sellpiaInventorySkuId: row.id,
        code: row.code,
        name: row.name,
        optionName: row.optionName,
        barcode: row.barcode,
        currentStock: row.currentStock,
        purchasePrice: row.purchasePrice,
        salePrice: row.salePrice,
        isActive: row.isActive,
        lastImportRunId: row.lastImportRun?.id ?? null,
        lastImportedAt: row.lastImportRun?.importedAt ?? null,
        linkedChannelOptionCount: linkedChannelOptions.length,
        linkedProductCount: linkedProducts.length,
        linkedProducts,
        linkedChannelOptions,
      };
    }),
    total,
    summary: {
      totalSkus: inventorySafeInteger(summary.totalSkus, 'totalSkus'),
      linkedSkus: inventorySafeInteger(summary.linkedSkus, 'linkedSkus'),
      unlinkedSkus: inventorySafeInteger(summary.unlinkedSkus, 'unlinkedSkus'),
      inStockSkus: inventorySafeInteger(summary.inStockSkus, 'inStockSkus'),
      outOfStockSkus: inventorySafeInteger(
        summary.outOfStockSkus,
        'outOfStockSkus',
      ),
      totalUnits: inventorySafeInteger(summary.totalUnits, 'totalUnits'),
      pricedAssetValue: inventorySafeInteger(
        summary.pricedAssetValue,
        'pricedAssetValue',
      ),
      unpricedSkuCount: inventorySafeInteger(
        summary.unpricedSkuCount,
        'unpricedSkuCount',
      ),
    },
    latestImport: latestImport ? mapInventoryImportRun(latestImport) : null,
  };
}

/** One published inventory snapshot row with its current linked destinations. */
export async function readInventorySkuSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sellpiaInventorySkuId: string,
): Promise<InventorySkuSnapshotRow | null> {
  const row = await tx.sellpiaInventorySku.findFirst({
    where: {
      id: sellpiaInventorySkuId,
      organizationId,
    },
    select: inventorySnapshotDetailSelect(organizationId),
  });
  if (!row) return null;
  const destinationsBySkuId = await readInventoryLinkedDestinations(
    tx,
    organizationId,
    [row.id],
  );
  const { linkedProducts, linkedChannelOptions } = inventoryLinkedDestinations(
    destinationsBySkuId.get(row.id) ?? [],
  );
  return {
    sellpiaInventorySkuId: row.id,
    code: row.code,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    currentStock: row.currentStock,
    purchasePrice: row.purchasePrice,
    salePrice: row.salePrice,
    isActive: row.isActive,
    lastImportRunId: row.lastImportRun?.id ?? null,
    lastImportedAt: row.lastImportRun?.importedAt ?? null,
    linkedChannelOptionCount: linkedChannelOptions.length,
    linkedProductCount: linkedProducts.length,
    linkedProducts,
    linkedChannelOptions,
  };
}

/**
 * Inventory's identity-only reader. Matching and reference validation can use
 * these facts without treating snapshot collection or stock as identity.
 */
export async function readInventorySkuIdentities(
  store: InventorySkuIdentityStore,
  input: InventorySkuIdentityQuery,
): Promise<SellpiaInventorySkuReadModel[]> {
  const { organizationId, selector } = input;
  if ('values' in selector && selector.values.length === 0) return [];
  if (selector.kind === 'normalized_barcodes') {
    const rows = await store.$queryRaw<
      SelectedSellpiaInventorySkuIdentity[]
    >(Prisma.sql`
      SELECT
        id,
        code,
        name,
        option_name AS "optionName",
        barcode,
        purchase_price AS "purchasePrice",
        sale_price AS "salePrice",
        is_active AS "isActive",
        master_product_id AS "masterProductId"
      FROM sellpia_inventory_skus
      WHERE organization_id = ${organizationId}::uuid
        AND regexp_replace(coalesce(barcode, ''), '[^0-9]', '', 'g')
          IN (${Prisma.join(selector.values)})
      ORDER BY code ASC, id ASC
    `);
    return rows.map(toInventorySkuIdentity);
  }
  if (selector.kind === 'normalized_names') {
    const rows = await store.$queryRaw<
      SelectedSellpiaInventorySkuIdentity[]
    >(Prisma.sql`
      SELECT
        id,
        code,
        name,
        option_name AS "optionName",
        barcode,
        purchase_price AS "purchasePrice",
        sale_price AS "salePrice",
        is_active AS "isActive",
        master_product_id AS "masterProductId"
      FROM sellpia_inventory_skus
      WHERE organization_id = ${organizationId}::uuid
        AND regexp_replace(
          lower(normalize(name, NFKC)),
          '[[:space:]]+',
          '',
          'g'
        ) IN (${Prisma.join(selector.values)})
      ORDER BY code ASC, id ASC
    `);
    return rows.map(toInventorySkuIdentity);
  }

  const common = { organizationId };
  const query: Prisma.SellpiaInventorySkuFindManyArgs =
    selector.kind === 'all'
      ? { where: common }
        : selector.kind === 'ids'
          ? { where: { ...common, id: { in: selector.values } } }
          : selector.kind === 'codes'
            ? {
                where: {
                  ...common,
                  code: { in: selector.values },
                },
              }
            : selector.kind === 'barcodes'
              ? {
                  where: {
                    ...common,
                    barcode: { in: selector.values },
                  },
                }
              : {
                  where: {
                    ...common,
                    OR: [
                      {
                        code: { contains: selector.query, mode: 'insensitive' },
                      },
                      {
                        name: { contains: selector.query, mode: 'insensitive' },
                      },
                      {
                        optionName: {
                          contains: selector.query,
                          mode: 'insensitive',
                        },
                      },
                      {
                        barcode: {
                          contains: selector.query,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                  take: Math.min(100, Math.max(1, Math.trunc(selector.limit))),
                };
  const rows = await store.sellpiaInventorySku.findMany({
    ...query,
    select: SELLPIA_INVENTORY_SKU_IDENTITY_SELECT,
    orderBy:
      selector.kind === 'all' ||
      selector.kind === 'search'
        ? [{ code: 'asc' }, { id: 'asc' }]
        : undefined,
  });
  return rows.map(toInventorySkuIdentity);
}

/** Current recipe identity used to associate listing age with canonical products. */
export async function readInventorySaleAgeMappings(
  store: InventorySkuIdentityStore,
  organizationId: string,
  masterProductIds: string[],
): Promise<InventorySaleAgeMapping[]> {
  if (masterProductIds.length === 0) return [];
  const inventorySkus = await store.sellpiaInventorySku.findMany({
    where: {
      organizationId,
      masterProductId: { in: masterProductIds },
    },
    select: {
      id: true,
      masterProductId: true,
      masterProduct: { select: { isActive: true } },
    },
  });
  if (inventorySkus.length === 0) return [];
  const inventorySkuIds = inventorySkus.map(({ id }) => id);
  const listings = await store.channelListing.findMany({
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
              sellpiaInventorySkuId: { in: inventorySkuIds },
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
              sellpiaInventorySkuId: true,
            },
          },
        },
      },
    },
  });
  const componentIds = [...new Set(listings.flatMap((listing) =>
    listing.options.flatMap((option) => option.inventoryComponents.map(
      (component) => component.sellpiaInventorySkuId,
    ))))];
  // Completeness belongs to the whole listing, even when the caller evaluates
  // one product. Other options must resolve through their own SKU identities.
  const componentSkus = await store.sellpiaInventorySku.findMany({
    where: { organizationId, id: { in: componentIds } },
    select: { id: true, masterProductId: true, masterProduct: { select: { isActive: true } } },
  });
  const inventorySkuById = new Map(componentSkus.map((sku) => [sku.id, sku] as const));
  return listings.map((listing) => ({
    listingId: listing.id,
    options: listing.options.map((option) => ({
      components: option.inventoryComponents.map((component) => ({
        quantity: component.quantity,
        masterProductId:
          inventorySkuById.get(component.sellpiaInventorySkuId)
            ?.masterProductId ?? null,
        masterProductActive:
          inventorySkuById.get(component.sellpiaInventorySkuId)
            ?.masterProduct?.isActive === true,
      })),
    })),
  }));
}

function inventorySnapshotSelect(_organizationId: string) {
  return INVENTORY_SNAPSHOT_SELECT;
}

function inventorySnapshotDetailSelect(organizationId: string) {
  return {
    ...inventorySnapshotSelect(organizationId),
    lastImportRun: {
      select: {
        id: true,
        sourceType: true,
        channelAccountId: true,
        status: true,
        importedAt: true,
      },
    },
  } satisfies Prisma.SellpiaInventorySkuSelect;
}

async function readPublishedInventoryImport(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const state = await tx.sellpiaInventoryState.findUnique({
    where: { organizationId },
    select: { lastCompletedImportRunId: true },
  });
  if (!state?.lastCompletedImportRunId) return null;
  return tx.sourceImportRun.findFirst({
    where: {
      id: state.lastCompletedImportRunId,
      organizationId,
      sourceType: 'sellpia_inventory',
      channelAccountId: null,
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
    },
    select: INVENTORY_IMPORT_RUN_SELECT,
  });
}

function inventorySnapshotWhere(
  organizationId: string,
  query: InventorySkuSnapshotQuery,
  linkedSkuIds: readonly string[] | null,
): Prisma.SellpiaInventorySkuWhereInput {
  const search = query.query?.trim();
  return {
    organizationId,
    ...(query.stockStatus === 'in_stock'
      ? { currentStock: { gt: 0 } }
      : query.stockStatus === 'out_of_stock'
        ? { currentStock: 0 }
        : {}),
    ...(linkedSkuIds === null
      ? {}
      : query.linkStatus === 'linked'
        ? { id: { in: [...linkedSkuIds] } }
        : { id: { notIn: [...linkedSkuIds] } }),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { optionName: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

function inventoryActiveComponentWhere(organizationId: string) {
  return {
    organizationId,
    channelListingOption: {
      organizationId,
      isActive: true,
      listing: {
        organizationId,
        isActive: true,
        masterProductId: { not: null },
      },
    },
  } satisfies Prisma.ChannelListingOptionInventoryComponentWhereInput;
}

async function readLinkedInventorySkuIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  linkStatus: InventorySkuSnapshotQuery['linkStatus'],
): Promise<readonly string[] | null> {
  if (!linkStatus) return null;
  const rows = await tx.channelListingOptionInventoryComponent.findMany({
    where: inventoryActiveComponentWhere(organizationId),
    select: { sellpiaInventorySkuId: true },
  });
  return [...new Set(rows.map(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId))];
}

type InventoryChannelOptionDestination = {
  sellpiaInventorySkuId: string;
  channelListingOption: {
    id: string;
    externalOptionId: string;
    itemName: string | null;
    listing: {
      id: string;
      masterProduct: { id: string; code: string; name: string } | null;
      channelAccount: { channel: string };
    };
  };
};

async function readInventoryLinkedDestinations(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sellpiaInventorySkuIds: readonly string[],
) {
  const destinationsBySkuId = new Map<
    string,
    InventoryChannelOptionDestination[]
  >();
  if (sellpiaInventorySkuIds.length === 0) return destinationsBySkuId;
  const rows = await tx.channelListingOptionInventoryComponent.findMany({
    where: {
      ...inventoryActiveComponentWhere(organizationId),
      sellpiaInventorySkuId: { in: [...sellpiaInventorySkuIds] },
    },
    select: {
      sellpiaInventorySkuId: true,
      channelListingOption: {
        select: {
          id: true,
          externalOptionId: true,
          itemName: true,
          listing: {
            select: {
              id: true,
              masterProduct: { select: { id: true, code: true, name: true } },
              channelAccount: { select: { channel: true } },
            },
          },
        },
      },
    },
  });
  for (const row of rows) {
    const destinations = destinationsBySkuId.get(row.sellpiaInventorySkuId);
    if (destinations) destinations.push(row);
    else destinationsBySkuId.set(row.sellpiaInventorySkuId, [row]);
  }
  return destinationsBySkuId;
}

function inventoryLinkedDestinations(
  components: InventoryChannelOptionDestination[],
) {
  const linkedChannelOptionById = new Map(
    components.flatMap(({ channelListingOption }) => {
      const masterProduct = channelListingOption.listing.masterProduct;
      if (!masterProduct) return [];
      return [
        [
          channelListingOption.id,
          {
            id: channelListingOption.id,
            masterProductId: masterProduct.id,
            channelListingId: channelListingOption.listing.id,
            channel: channelListingOption.listing.channelAccount.channel,
            externalOptionId: channelListingOption.externalOptionId,
            itemName: channelListingOption.itemName,
          },
        ] as const,
      ];
    }),
  );
  const linkedProductById = new Map(
    components.flatMap(({ channelListingOption }) => {
      const masterProduct = channelListingOption.listing.masterProduct;
      return masterProduct ? [[masterProduct.id, masterProduct] as const] : [];
    }),
  );
  const byCodeThenId = <T extends { code: string; id: string }>(
    left: T,
    right: T,
  ) => left.code.localeCompare(right.code) || left.id.localeCompare(right.id);
  return {
    linkedProducts: [...linkedProductById.values()].sort(byCodeThenId),
    linkedChannelOptions: [...linkedChannelOptionById.values()].sort(
      (left, right) =>
        left.channel.localeCompare(right.channel) ||
        left.externalOptionId.localeCompare(right.externalOptionId) ||
        left.id.localeCompare(right.id),
    ),
  };
}

function mapInventoryImportRun(
  row: Prisma.SourceImportRunGetPayload<{
    select: typeof INVENTORY_IMPORT_RUN_SELECT;
  }>,
): SellpiaImportRunRow {
  if (!isSourceImportStatus(row.status)) {
    throw new Error(`Unknown source import status: ${row.status}`);
  }
  return {
    ...row,
    status: row.status,
    lastTrigger:
      row.lastTrigger === null
        ? null
        : SellpiaInventoryStoredCollectionTriggerSchema.parse(row.lastTrigger),
    qualityReport: SellpiaInventoryQualityReportSchema.nullable().parse(
      row.qualityReport,
    ),
  };
}

function inventorySafeInteger(value: bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`Inventory snapshot ${field} exceeds safe range`);
  }
  return result;
}

function inventoryEmptySummaryRow(): InventorySummaryRow {
  return {
    totalSkus: 0n,
    linkedSkus: 0n,
    unlinkedSkus: 0n,
    inStockSkus: 0n,
    outOfStockSkus: 0n,
    totalUnits: 0n,
    pricedAssetValue: 0n,
    unpricedSkuCount: 0n,
  };
}

function inventoryEmptySummary() {
  return {
    totalSkus: 0,
    linkedSkus: 0,
    unlinkedSkus: 0,
    inStockSkus: 0,
    outOfStockSkus: 0,
    totalUnits: 0,
    pricedAssetValue: 0,
    unpricedSkuCount: 0,
  };
}

async function loadInventorySkus(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sellpiaInventorySkuIds: string[],
) {
  if (sellpiaInventorySkuIds.length === 0) return [];
  const rows = await tx.sellpiaInventorySku.findMany({
    where: { organizationId, id: { in: sellpiaInventorySkuIds } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      currentStock: true,
      isActive: true,
      lastImportRunId: true,
    },
  });
  return rows;
}

async function loadPublishedInventoryBasis(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<Readonly<{
  runId: string;
  generation: string;
  verifiedAt: Date;
}> | null> {
  const state = await tx.sellpiaInventoryState.findUnique({
    where: { organizationId },
    select: {
      verifiedGeneration: true,
      lastVerifiedAt: true,
      lastCompletedImportRunId: true,
    },
  });
  if (
    state === null ||
    state.verifiedGeneration <= 0n ||
    state.lastVerifiedAt === null ||
    state.lastCompletedImportRunId === null
  )
    return null;

  const publishedRun = await tx.sourceImportRun.findFirst({
    where: {
      id: state.lastCompletedImportRunId,
      organizationId,
      sourceType: 'sellpia_inventory',
      channelAccountId: null,
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
    },
    select: { id: true },
  });
  return publishedRun === null
    ? null
    : {
        runId: publishedRun.id,
        generation: state.verifiedGeneration.toString(),
        verifiedAt: state.lastVerifiedAt,
      };
}

function toInventorySkuIdentity(
  row: SelectedSellpiaInventorySkuIdentity,
): SellpiaInventorySkuReadModel {
  return {
    sellpiaInventorySkuId: row.id,
    code: row.code,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    purchasePrice: row.purchasePrice,
    salePrice: row.salePrice,
    isActive: row.isActive,
    masterProductId: row.masterProductId,
  };
}
