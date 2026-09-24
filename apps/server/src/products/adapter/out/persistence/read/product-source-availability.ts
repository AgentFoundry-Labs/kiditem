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
  assertProductSourceLockCovers,
  type ProductSourceLock,
} from '../transaction/product-source-lock';
import type {
  ProductSourceReadModel,
} from '../../../../domain/product-source-read-model';
import type { InventorySkuSnapshotSummary } from '@kiditem/shared/inventory';

type ProductAvailabilityQuery = {
  organizationId: string;
  masterProductIds: string[];
};

type ProductAvailabilityCandidate = Readonly<{
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number | null;
}>;

type ProductMatchingCandidate = ProductAvailabilityCandidate;

type ProductSaleAgeMapping = Readonly<{
  listingId: string;
  options: readonly Readonly<{
    components: readonly Readonly<{
      quantity: number;
      masterProductId: string | null;
    }>[];
  }>[];
}>;

type ProductSourceIdentitySelector =
  | { kind: 'all' }
  | { kind: 'ids'; values: string[] }
  | { kind: 'codes'; values: string[] }
  | {
      kind: 'source_identity';
      sourceAccountKey: string;
      sourceProductCode: string;
      sourceOptionCode: string;
    }
  | {
      kind: 'source_codes';
      sourceAccountKey: string;
      values: ReadonlyArray<Readonly<{
        sourceProductCode: string;
        sourceOptionCode: string;
      }>>;
    }
  | { kind: 'barcodes'; values: string[] }
  | { kind: 'normalized_barcodes'; values: string[] }
  | { kind: 'normalized_names'; values: string[] }
  | { kind: 'search'; query: string; limit: number };

type ProductSourceIdentityQuery = {
  organizationId: string;
  selector: ProductSourceIdentitySelector;
};

type ProductSourceSnapshotQuery = {
  skip: number;
  take?: number;
  query?: string;
  stockStatus: 'all' | 'in_stock' | 'out_of_stock';
  linkStatus?: 'linked' | 'unlinked';
};

type ProductSourceSnapshotLinkedProduct = Readonly<{
  id: string;
  code: string;
  name: string;
}>;

type ProductSourceSnapshotLinkedChannelOption = Readonly<{
  id: string;
  masterProductId: string;
  channelListingId: string;
  channel: string;
  externalOptionId: string;
  itemName: string | null;
}>;

type ProductSourceSnapshotRow = Readonly<{
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  lastImportRunId: string | null;
  lastImportedAt: Date | null;
  linkedChannelOptionCount: number;
  linkedProductCount: number;
  linkedProducts: ProductSourceSnapshotLinkedProduct[];
  linkedChannelOptions: ProductSourceSnapshotLinkedChannelOption[];
}>;

type ProductSourceImportRunRow = Readonly<{
  id: string;
  fileName: string | null;
  fileHash: string | null;
  status: string;
  rowCount: number;
  importedAt: Date | null;
  lastVerifiedAt: Date | null;
  verificationCount: number;
  lastTrigger: string | null;
  freshnessGeneration: bigint | null;
  manualFreshExportConfirmedAt: Date | null;
  manualFreshExportConfirmedBy: string | null;
  qualityReport: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

const SOURCE_ACCOUNT_KEY = 'kiditem' as const;
const SOURCE_TYPE = 'sellpia_inventory' as const;

const PRODUCT_SOURCE_MASTER_PRODUCT_IDENTITY_SELECT = {
  id: true,
  code: true,
  sourceAccountKey: true,
  sourceProductCode: true,
  sourceOptionCode: true,
  name: true,
  optionName: true,
  barcode: true,
  purchasePrice: true,
  imageUrls: true,
  currentStock: true,
} as const;

type SelectedProductSourceIdentity = Prisma.MasterProductGetPayload<{
  select: typeof PRODUCT_SOURCE_MASTER_PRODUCT_IDENTITY_SELECT;
}>;

type ProductSourceIdentityStore = Pick<
  Prisma.TransactionClient,
  'masterProduct' | 'channelListing' | '$queryRaw'
>;

const PRODUCT_SOURCE_IMPORT_RUN_SELECT = {
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

type ProductSourceImportRunSelect = Prisma.SourceImportRunGetPayload<{
  select: typeof PRODUCT_SOURCE_IMPORT_RUN_SELECT;
}>;

type ProductSourceSummaryRow = {
  totalProducts: bigint;
  linkedProducts: bigint;
  unlinkedProducts: bigint;
  inStockProducts: bigint;
  outOfStockProducts: bigint;
  totalUnits: bigint;
  pricedAssetValue: bigint;
  unpricedProductCount: bigint;
};

/**
 * Transaction-aware current-stock reader. The source state pointer and the
 * MasterProduct rows are read while the Products source lock is held, so an
 * availability response cannot combine rows from different complete runs.
 */
export async function readProductSourceAvailability(
  tx: Prisma.TransactionClient,
  lock: ProductSourceLock,
  input: ProductAvailabilityQuery,
): Promise<InventoryAvailabilityBatch> {
  assertProductSourceLockCovers(lock, tx, input.organizationId);
  const [products, basis] = await Promise.all([
    loadProductSources(tx, input.organizationId, input.masterProductIds),
    loadPublishedInventoryBasis(tx, input.organizationId),
  ]);
  return InventoryAvailabilityBatchSchema.parse({
    snapshot: {
      collected: basis !== null,
      generation: basis?.generation ?? null,
      verifiedAt: basis?.verifiedAt.toISOString() ?? null,
    },
    items: products.map((product) => ({
      masterProductId: product.id,
      currentStock: product.currentStock,
      generation: basis?.generation ?? null,
    })),
  });
}

export async function readActiveProductMatchingCandidates(
  tx: Prisma.TransactionClient,
  lock: ProductSourceLock,
  organizationId: string,
): Promise<ProductMatchingCandidate[]> {
  assertProductSourceLockCovers(lock, tx, organizationId);
  const identities = await readProductSourceIdentities(tx, {
    organizationId,
    selector: { kind: 'all' },
  });
  const availability = await readProductSourceAvailability(tx, lock, {
    organizationId,
    masterProductIds: identities.map(({ masterProductId }) => masterProductId),
  });
  const availabilityByMasterProductId = new Map(
    availability.items.map((item) => [item.masterProductId, item]),
  );
  return identities.map((identity) => ({
    masterProductId: identity.masterProductId,
    code: identity.code,
    name: identity.name,
    optionName: identity.optionName,
    barcode: identity.barcode,
    currentStock: availabilityByMasterProductId.get(identity.masterProductId)?.currentStock ?? null,
  }));
}

export async function readProductAvailabilityCandidates(
  tx: Prisma.TransactionClient,
  lock: ProductSourceLock,
  input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  },
): Promise<ProductAvailabilityCandidate[]> {
  assertProductSourceLockCovers(lock, tx, input.organizationId);
  const rows = await tx.masterProduct.findMany({
    where: {
      organizationId: input.organizationId,
      sourceAccountKey: SOURCE_ACCOUNT_KEY,
      ...(input.stockStatus === 'in_stock' ? { currentStock: { gt: 0 } } : {}),
      OR: [
        { code: { contains: input.query, mode: 'insensitive' } },
        { name: { contains: input.query, mode: 'insensitive' } },
        { optionName: { contains: input.query, mode: 'insensitive' } },
        { barcode: { contains: input.query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      optionName: true,
      barcode: true,
      currentStock: true,
    },
    orderBy: [{ code: 'asc' }, { id: 'asc' }],
    take: input.limit,
  });
  return rows.map((row) => ({
    masterProductId: row.id,
    code: row.code,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    currentStock: row.currentStock,
  }));
}

/** Product-owned source snapshot used by the read and export use cases. */
export async function readProductSourceSnapshotList(
  tx: Prisma.TransactionClient,
  organizationId: string,
  query: ProductSourceSnapshotQuery,
): Promise<{
  rows: ProductSourceSnapshotRow[];
  total: number;
  summary: InventorySkuSnapshotSummary;
  latestImport: ProductSourceImportRunRow | null;
}> {
  const latestImport = await readPublishedInventoryImport(tx, organizationId);
  const linkedMasterProductIds = await readLinkedProductSourceIds(
    tx,
    organizationId,
    query.linkStatus,
  );
  const where = productSourceSnapshotWhere(
    organizationId,
    query,
    linkedMasterProductIds,
  );
  const [rows, total, summaryRows] = await Promise.all([
    tx.masterProduct.findMany({
      where,
      select: PRODUCT_SOURCE_SNAPSHOT_SELECT,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      skip: query.skip,
      ...(query.take === undefined ? {} : { take: query.take }),
    }),
    tx.masterProduct.count({ where }),
    tx.$queryRaw<ProductSourceSummaryRow[]>`
      SELECT
        COUNT(*)::bigint AS "totalProducts",
        COUNT(*) FILTER (WHERE current_stock > 0)::bigint AS "inStockProducts",
        COUNT(*) FILTER (WHERE current_stock = 0)::bigint AS "outOfStockProducts",
        COALESCE(SUM(current_stock), 0)::bigint AS "totalUnits",
        COALESCE(
          SUM(current_stock::bigint * purchase_price::bigint)
            FILTER (WHERE purchase_price IS NOT NULL),
          0
        )::bigint AS "pricedAssetValue",
        COUNT(*) FILTER (WHERE purchase_price IS NULL)::bigint AS "unpricedProductCount",
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
          WHERE component.organization_id = ${organizationId}::uuid
            AND component.master_product_id = product.id
        ))::bigint AS "linkedProducts",
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
          WHERE component.organization_id = ${organizationId}::uuid
            AND component.master_product_id = product.id
        ))::bigint AS "unlinkedProducts"
      FROM master_products product
      WHERE product.organization_id = ${organizationId}::uuid
        AND product.source_account_key = ${SOURCE_ACCOUNT_KEY}
    `,
  ]);
  const destinationsByMasterProductId = await readInventoryLinkedDestinations(
    tx,
    organizationId,
    rows.map((row) => row.id),
  );
  const summary = summaryRows[0] ?? productSourceEmptySummaryRow();
  return {
    rows: rows.map((row): ProductSourceSnapshotRow => {
      const destinations = destinationsByMasterProductId.get(row.id) ?? [];
      const { linkedProducts, linkedChannelOptions } =
        productSourceLinkedDestinations(destinations);
      return {
        masterProductId: row.id,
        code: row.code,
        name: row.name,
        optionName: row.optionName,
        barcode: row.barcode,
        currentStock: row.currentStock,
        purchasePrice: row.purchasePrice,
        lastImportRunId: latestImport?.id ?? null,
        lastImportedAt: latestImport?.importedAt ?? null,
        linkedChannelOptionCount: linkedChannelOptions.length,
        linkedProductCount: linkedProducts.length,
        linkedProducts,
        linkedChannelOptions,
      };
    }),
    total,
    // 공개 계약(shared `InventorySkuSnapshotSummarySchema`)의 이름으로 낸다 — 단위는 마스터 상품이지만 계약 이름은 sku 다(KID-331).
    summary: {
      totalSkus: productSourceSafeInteger(summary.totalProducts, 'totalProducts'),
      linkedSkus: productSourceSafeInteger(summary.linkedProducts, 'linkedProducts'),
      unlinkedSkus: productSourceSafeInteger(summary.unlinkedProducts, 'unlinkedProducts'),
      inStockSkus: productSourceSafeInteger(summary.inStockProducts, 'inStockProducts'),
      outOfStockSkus: productSourceSafeInteger(summary.outOfStockProducts, 'outOfStockProducts'),
      totalUnits: productSourceSafeInteger(summary.totalUnits, 'totalUnits'),
      pricedAssetValue: productSourceSafeInteger(summary.pricedAssetValue, 'pricedAssetValue'),
      unpricedSkuCount: productSourceSafeInteger(summary.unpricedProductCount, 'unpricedProductCount'),
    },
    latestImport,
  };
}

export async function readProductSourceSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  masterProductId: string,
): Promise<ProductSourceSnapshotRow | null> {
  const [row, latestImport] = await Promise.all([
    tx.masterProduct.findFirst({
      where: {
        id: masterProductId,
        organizationId,
        sourceAccountKey: SOURCE_ACCOUNT_KEY,
      },
      select: PRODUCT_SOURCE_SNAPSHOT_SELECT,
    }),
    readPublishedInventoryImport(tx, organizationId),
  ]);
  if (!row) return null;
  const destinationsByMasterProductId = await readInventoryLinkedDestinations(
    tx,
    organizationId,
    [row.id],
  );
  const { linkedProducts, linkedChannelOptions } = productSourceLinkedDestinations(
    destinationsByMasterProductId.get(row.id) ?? [],
  );
  return {
    masterProductId: row.id,
    code: row.code,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    currentStock: row.currentStock,
    purchasePrice: row.purchasePrice,
    lastImportRunId: latestImport?.id ?? null,
    lastImportedAt: latestImport?.importedAt ?? null,
    linkedChannelOptionCount: linkedChannelOptions.length,
    linkedProductCount: linkedProducts.length,
    linkedProducts,
    linkedChannelOptions,
  };
}

/** Source identities used by product matching and reference validation. */
export async function readProductSourceIdentities(
  store: ProductSourceIdentityStore,
  input: ProductSourceIdentityQuery,
): Promise<ProductSourceReadModel[]> {
  const { organizationId, selector } = input;
  if ('values' in selector && selector.values.length === 0) return [];
  if (selector.kind === 'source_identity') {
    const rows = await store.masterProduct.findMany({
      where: {
        organizationId,
        sourceAccountKey: selector.sourceAccountKey,
        sourceProductCode: selector.sourceProductCode,
        sourceOptionCode: selector.sourceOptionCode,
      },
      select: PRODUCT_SOURCE_MASTER_PRODUCT_IDENTITY_SELECT,
    });
    return rows.map(toProductSourceIdentity);
  }
  if (selector.kind === 'source_codes') {
    const rows = await store.masterProduct.findMany({
      where: {
        organizationId,
        sourceAccountKey: selector.sourceAccountKey,
        OR: selector.values.map(({ sourceProductCode, sourceOptionCode }) => ({
          sourceProductCode,
          sourceOptionCode,
        })),
      },
      select: PRODUCT_SOURCE_MASTER_PRODUCT_IDENTITY_SELECT,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toProductSourceIdentity);
  }
  if (selector.kind === 'normalized_barcodes') {
    const rows = await store.$queryRaw<SelectedProductSourceIdentity[]>(Prisma.sql`
      SELECT id, code, source_account_key AS "sourceAccountKey",
        source_product_code AS "sourceProductCode",
        source_option_code AS "sourceOptionCode", name,
        option_name AS "optionName", barcode,
        purchase_price AS "purchasePrice", image_urls AS "imageUrls",
        current_stock AS "currentStock"
      FROM master_products
      WHERE organization_id = ${organizationId}::uuid
        AND source_account_key = ${SOURCE_ACCOUNT_KEY}
        AND regexp_replace(coalesce(barcode, ''), '[^0-9]', '', 'g')
          IN (${Prisma.join(selector.values)})
      ORDER BY code ASC, id ASC
    `);
    return rows.map(toProductSourceIdentity);
  }
  if (selector.kind === 'normalized_names') {
    const rows = await store.$queryRaw<SelectedProductSourceIdentity[]>(Prisma.sql`
      SELECT id, code, source_account_key AS "sourceAccountKey",
        source_product_code AS "sourceProductCode",
        source_option_code AS "sourceOptionCode", name,
        option_name AS "optionName", barcode,
        purchase_price AS "purchasePrice", image_urls AS "imageUrls",
        current_stock AS "currentStock"
      FROM master_products
      WHERE organization_id = ${organizationId}::uuid
        AND source_account_key = ${SOURCE_ACCOUNT_KEY}
        AND regexp_replace(lower(normalize(name, NFKC)), '[[:space:]]+', '', 'g')
          IN (${Prisma.join(selector.values)})
      ORDER BY code ASC, id ASC
    `);
    return rows.map(toProductSourceIdentity);
  }

  const common: Prisma.MasterProductWhereInput = {
    organizationId,
    sourceAccountKey: SOURCE_ACCOUNT_KEY,
  };
  const query: Prisma.MasterProductFindManyArgs =
    selector.kind === 'all'
      ? { where: common }
      : selector.kind === 'ids'
        ? { where: { ...common, id: { in: selector.values } } }
        : selector.kind === 'codes'
          ? { where: { ...common, code: { in: selector.values } } }
          : selector.kind === 'barcodes'
            ? { where: { ...common, barcode: { in: selector.values } } }
            : {
                where: {
                  ...common,
                  OR: [
                    { code: { contains: selector.query, mode: 'insensitive' } },
                    { name: { contains: selector.query, mode: 'insensitive' } },
                    { optionName: { contains: selector.query, mode: 'insensitive' } },
                    { barcode: { contains: selector.query, mode: 'insensitive' } },
                  ],
                },
                take: Math.min(100, Math.max(1, Math.trunc(selector.limit))),
              };
  const rows = await store.masterProduct.findMany({
    ...query,
    select: PRODUCT_SOURCE_MASTER_PRODUCT_IDENTITY_SELECT,
    orderBy: selector.kind === 'all' || selector.kind === 'search'
      ? [{ code: 'asc' }, { id: 'asc' }]
      : undefined,
  });
  return rows.map(toProductSourceIdentity);
}

/** Current channel recipe identity used by sale-age calculations. */
export async function readProductSaleAgeMappings(
  store: ProductSourceIdentityStore,
  organizationId: string,
  masterProductIds: string[],
): Promise<ProductSaleAgeMapping[]> {
  if (masterProductIds.length === 0) return [];
  const listings = await store.channelListing.findMany({
    where: {
      organizationId,
      isActive: true,
      options: {
        some: {
          organizationId,
          isActive: true,
          inventoryComponents: {
            some: { organizationId, masterProductId: { in: masterProductIds } },
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
            select: { quantity: true, masterProductId: true },
          },
        },
      },
    },
  });
  return listings.map((listing) => ({
    listingId: listing.id,
    options: listing.options.map((option) => ({
      components: option.inventoryComponents.map((component) => ({
        quantity: component.quantity,
        masterProductId: component.masterProductId,
      })),
    })),
  }));
}

/** Compatibility reader for consumers that need all source-backed products. */
export async function readMasterProductIdsWithAliveSource(
  store: Pick<Prisma.TransactionClient, 'masterProduct'>,
  input: { organizationId: string },
): Promise<string[]> {
  const rows = await store.masterProduct.findMany({
    where: {
      organizationId: input.organizationId,
      sourceAccountKey: SOURCE_ACCOUNT_KEY,
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => row.id);
}

const PRODUCT_SOURCE_SNAPSHOT_SELECT = {
  id: true,
  code: true,
  name: true,
  optionName: true,
  barcode: true,
  currentStock: true,
  purchasePrice: true,
} as const satisfies Prisma.MasterProductSelect;

function productSourceSnapshotWhere(
  organizationId: string,
  query: ProductSourceSnapshotQuery,
  linkedMasterProductIds: readonly string[] | null,
): Prisma.MasterProductWhereInput {
  const search = query.query?.trim();
  return {
    organizationId,
    sourceAccountKey: SOURCE_ACCOUNT_KEY,
    ...(query.stockStatus === 'in_stock'
      ? { currentStock: { gt: 0 } }
      : query.stockStatus === 'out_of_stock'
        ? { currentStock: 0 }
        : {}),
    ...(linkedMasterProductIds === null
      ? {}
      : query.linkStatus === 'linked'
        ? { id: { in: [...linkedMasterProductIds] } }
        : { id: { notIn: [...linkedMasterProductIds] } }),
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
      },
    },
  } satisfies Prisma.ChannelListingOptionInventoryComponentWhereInput;
}

async function readLinkedProductSourceIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  linkStatus: ProductSourceSnapshotQuery['linkStatus'],
): Promise<readonly string[] | null> {
  if (!linkStatus) return null;
  const rows = await tx.channelListingOptionInventoryComponent.findMany({
    where: inventoryActiveComponentWhere(organizationId),
    select: { masterProductId: true },
  });
  return [...new Set(rows.map(({ masterProductId }) => masterProductId))];
}

type InventoryChannelOptionDestination = {
  masterProductId: string;
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
  masterProductIds: readonly string[],
): Promise<Map<string, InventoryChannelOptionDestination[]>> {
  const destinationsByMasterProductId = new Map<string, InventoryChannelOptionDestination[]>();
  if (masterProductIds.length === 0) return destinationsByMasterProductId;
  const rows = await tx.channelListingOptionInventoryComponent.findMany({
    where: {
      ...inventoryActiveComponentWhere(organizationId),
      masterProductId: { in: [...masterProductIds] },
    },
    select: {
      masterProductId: true,
      channelListingOption: {
        select: {
          id: true,
          externalOptionId: true,
          itemName: true,
          listing: {
            select: {
              id: true,
              channelAccount: { select: { channel: true } },
            },
          },
        },
      },
    },
  });
  const linkedMasterProductIds = [
    ...new Set(
      rows
        .map((row) => row.masterProductId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const masterProducts = linkedMasterProductIds.length === 0
    ? []
    : await tx.masterProduct.findMany({
      where: { organizationId, id: { in: linkedMasterProductIds } },
      select: { id: true, code: true, name: true },
    });
  const masterProductById = new Map(masterProducts.map((product) => [product.id, product]));
  for (const row of rows) {
    const listing = row.channelListingOption.listing;
    const masterProduct = masterProductById.get(row.masterProductId) ?? null;
    if (!masterProduct) continue;
    const destination: InventoryChannelOptionDestination = {
      masterProductId: row.masterProductId,
      channelListingOption: {
        ...row.channelListingOption,
        listing: {
          ...listing,
          masterProduct,
        },
      },
    };
    const destinations = destinationsByMasterProductId.get(row.masterProductId) ?? [];
    destinations.push(destination);
    destinationsByMasterProductId.set(row.masterProductId, destinations);
  }
  return destinationsByMasterProductId;
}

function productSourceLinkedDestinations(
  components: InventoryChannelOptionDestination[],
): {
  linkedProducts: ProductSourceSnapshotLinkedProduct[];
  linkedChannelOptions: ProductSourceSnapshotLinkedChannelOption[];
} {
  const linkedChannelOptionById = new Map<string, ProductSourceSnapshotLinkedChannelOption>();
  const linkedProductById = new Map<string, ProductSourceSnapshotLinkedProduct>();
  for (const { channelListingOption } of components) {
    const masterProduct = channelListingOption.listing.masterProduct;
    if (!masterProduct) continue;
    linkedChannelOptionById.set(channelListingOption.id, {
      id: channelListingOption.id,
      masterProductId: masterProduct.id,
      channelListingId: channelListingOption.listing.id,
      channel: channelListingOption.listing.channelAccount.channel,
      externalOptionId: channelListingOption.externalOptionId,
      itemName: channelListingOption.itemName,
    });
    linkedProductById.set(masterProduct.id, masterProduct);
  }
  const byCodeThenId = <T extends { code: string; id: string }>(left: T, right: T) =>
    left.code.localeCompare(right.code) || left.id.localeCompare(right.id);
  return {
    linkedProducts: [...linkedProductById.values()].sort(byCodeThenId),
    linkedChannelOptions: [...linkedChannelOptionById.values()].sort((left, right) =>
      left.channel.localeCompare(right.channel)
      || left.externalOptionId.localeCompare(right.externalOptionId)
      || left.id.localeCompare(right.id)),
  };
}

async function loadProductSources(
  tx: Prisma.TransactionClient,
  organizationId: string,
  masterProductIds: string[],
) {
  if (masterProductIds.length === 0) return [];
  return tx.masterProduct.findMany({
    where: {
      organizationId,
      id: { in: masterProductIds },
      sourceAccountKey: SOURCE_ACCOUNT_KEY,
    },
    orderBy: { id: 'asc' },
    select: { id: true, currentStock: true },
  });
}

async function loadPublishedInventoryBasis(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<Readonly<{ runId: string; generation: string; verifiedAt: Date }> | null> {
  const state = await tx.sellpiaInventoryState.findUnique({
    where: { organizationId },
    select: {
      verifiedGeneration: true,
      lastVerifiedAt: true,
      lastCompletedImportRunId: true,
    },
  });
  if (
    state === null
    || state.verifiedGeneration <= 0n
    || state.lastVerifiedAt === null
    || state.lastCompletedImportRunId === null
  ) return null;
  const publishedRun = await tx.sourceImportRun.findFirst({
    where: {
      id: state.lastCompletedImportRunId,
      organizationId,
      sourceType: SOURCE_TYPE,
      channelAccountId: null,
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
      freshnessGeneration: state.verifiedGeneration,
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

async function readPublishedInventoryImport(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<ProductSourceImportRunRow | null> {
  const state = await tx.sellpiaInventoryState.findUnique({
    where: { organizationId },
    select: { lastCompletedImportRunId: true, verifiedGeneration: true },
  });
  if (!state?.lastCompletedImportRunId) return null;
  const row = await tx.sourceImportRun.findFirst({
    where: {
      id: state.lastCompletedImportRunId,
      organizationId,
      sourceType: SOURCE_TYPE,
      channelAccountId: null,
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
      ...(state.verifiedGeneration > 0n
        ? { freshnessGeneration: state.verifiedGeneration }
        : {}),
    },
    select: PRODUCT_SOURCE_IMPORT_RUN_SELECT,
  });
  return row ? mapInventoryImportRun(row) : null;
}

function toProductSourceIdentity(row: SelectedProductSourceIdentity): ProductSourceReadModel {
  return {
    masterProductId: row.id,
    code: row.code,
    sourceAccountKey: row.sourceAccountKey,
    sourceProductCode: row.sourceProductCode,
    sourceOptionCode: row.sourceOptionCode,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    purchasePrice: row.purchasePrice,
    imageUrls: row.imageUrls,
  };
}

function mapInventoryImportRun(row: ProductSourceImportRunSelect): ProductSourceImportRunRow {
  if (!isSourceImportStatus(row.status)) {
    throw new Error(`Unknown source import status: ${row.status}`);
  }
  return {
    id: row.id,
    fileName: row.fileName,
    fileHash: row.fileHash,
    status: row.status,
    rowCount: row.rowCount,
    importedAt: row.importedAt,
    lastVerifiedAt: row.lastVerifiedAt,
    verificationCount: row.verificationCount,
    lastTrigger: row.lastTrigger === null
      ? null
      : SellpiaInventoryStoredCollectionTriggerSchema.parse(row.lastTrigger),
    freshnessGeneration: row.freshnessGeneration,
    manualFreshExportConfirmedAt: row.manualFreshExportConfirmedAt,
    manualFreshExportConfirmedBy: row.manualFreshExportConfirmedBy,
    qualityReport: SellpiaInventoryQualityReportSchema.nullable().parse(row.qualityReport),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function productSourceSafeInteger(value: bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`Product source snapshot ${field} exceeds safe range`);
  }
  return result;
}

function productSourceEmptySummaryRow(): ProductSourceSummaryRow {
  return {
    totalProducts: 0n,
    linkedProducts: 0n,
    unlinkedProducts: 0n,
    inStockProducts: 0n,
    outOfStockProducts: 0n,
    totalUnits: 0n,
    pricedAssetValue: 0n,
    unpricedProductCount: 0n,
  };
}
