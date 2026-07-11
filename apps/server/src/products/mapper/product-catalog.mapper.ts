// apps/server/src/products/mapper/product-catalog.mapper.ts
//
// CatalogMasterRow / CatalogCountsRow → shared contract shape (list item,
// detail, counts). Pure — depends on `@kiditem/shared/product` types and
// `normalizeMasterImages` only. No Prisma client, no Nest provider.
import type {
  MoneyRange,
  ProductCatalogCounts,
  ProductCatalogDetail,
  ProductCatalogListItem,
  ProductOption,
} from '@kiditem/shared/product';
import { normalizeMasterImages } from '../domain/service/product-image-normalizer';
import type {
  CatalogCountsRow,
  CatalogMasterRow,
  CatalogOptionRow,
} from '../application/port/out/repository/product-catalog.repository.port';

export function range(values: Array<number | null | undefined>): MoneyRange | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export function activeOptions(row: CatalogMasterRow): CatalogOptionRow[] {
  return row.options
    .filter((o) => o.isActive && !o.isDeleted)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

function mapCatalogOption(row: CatalogOptionRow): ProductOption {
  return {
    id: row.id,
    masterId: row.masterId,
    organizationId: row.organizationId,
    sku: row.sku,
    barcode: row.barcode,
    legacyCode: row.legacyCode,
    optionName: row.optionName,
    sortOrder: row.sortOrder,
    costPrice: row.costPrice,
    sellPrice: row.sellPrice,
    commissionRate: row.commissionRate === null
      ? null
      : typeof row.commissionRate === 'number'
        ? row.commissionRate
        : row.commissionRate.toNumber(),
    shippingCost: row.shippingCost,
    otherCost: row.otherCost,
    isBundle: row.isBundle,
    isDeleted: row.isDeleted,
    deletedAt: row.deletedAt,
    isTemporary: row.isTemporary,
    temporaryReason: row.temporaryReason,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies ProductOption;
}

export function mapCatalogListItem(row: CatalogMasterRow): ProductCatalogListItem {
  const options = activeOptions(row);
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    legacyCode: row.legacyCode,
    barcode: row.barcode,
    name: row.name,
    description: row.description,
    category: row.category,
    brand: row.brand,
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    optionCounter: row.optionCounter,
    thumbnailUrl: row.thumbnailUrl,
    imageUrl: row.imageUrl,
    images: normalizeMasterImages(row.images),
    abcGrade: row.abcGrade as ProductCatalogListItem['abcGrade'],
    profitTag: row.profitTag,
    adTier: row.adTier,
    adBudgetLimit: row.adBudgetLimit,
    healthScore: row.healthScore,
    healthUpdatedAt: row.healthUpdatedAt,
    lifecycleState: row.lifecycleState as ProductCatalogListItem['lifecycleState'],
    detailPageUrl: row.detailPageUrl,
    thumbnailStrategy: row.thumbnailStrategy as ProductCatalogListItem['thumbnailStrategy'],
    isDeleted: row.isDeleted,
    deletedAt: row.deletedAt,
    isTemporary: row.isTemporary,
    temporaryReason: row.temporaryReason,
    memo: row.memo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    optionCount: options.length,
    representativeSku: options[0]?.sku ?? null,
    priceRange: range(options.map((o) => o.sellPrice)),
    costRange: range(options.map((o) => o.costPrice)),
  } satisfies ProductCatalogListItem;
}

export function mapCatalogDetail(row: CatalogMasterRow): ProductCatalogDetail {
  return {
    ...mapCatalogListItem(row),
    options: activeOptions(row).map(mapCatalogOption),
  } satisfies ProductCatalogDetail;
}

export function mapCatalogCounts(rows: CatalogCountsRow[]): ProductCatalogCounts {
  return {
    total: rows.length,
    gradeA: rows.filter((r) => r.abcGrade === 'A').length,
    gradeB: rows.filter((r) => r.abcGrade === 'B').length,
    gradeC: rows.filter((r) => r.abcGrade === 'C').length,
    adCount: rows.filter((r) => !!r.adTier).length,
    noAdCount: rows.filter((r) => !r.adTier).length,
    // Phase 5 (#192): count buckets follow `lifecycleState`. `totalCount`
    // mirrors `total` so consumers reading either bucket name see the same
    // catalog total.
    activeCount: rows.filter((r) => r.lifecycleState === 'active').length,
    pausedCount: rows.filter((r) => r.lifecycleState === 'paused').length,
    discontinuedCount: rows.filter((r) => r.lifecycleState === 'discontinued').length,
    totalCount: rows.length,
    temporaryCount: rows.filter((r) => r.isTemporary).length,
  } satisfies ProductCatalogCounts;
}
