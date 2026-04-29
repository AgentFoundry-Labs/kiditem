// apps/server/src/products/mapper/product-catalog.mapper.ts
//
// CatalogMasterRow / CatalogCountsRow → shared contract shape (list item,
// detail, counts). Pure — depends on `@kiditem/shared/product` types,
// `normalizeMasterImages`, and `toSerializable` only. No Prisma client, no
// Nest provider.
import type {
  MoneyRange,
  ProductCatalogCounts,
  ProductCatalogDetail,
  ProductCatalogListItem,
} from '@kiditem/shared/product';
import { toSerializable } from '../util/serialize';
import { normalizeMasterImages } from '../domain/service/product-image-normalizer';
import type {
  CatalogCountsRow,
  CatalogMasterRow,
  CatalogOptionRow,
} from '../adapter/out/prisma/product-catalog.query';

export function range(values: Array<number | null | undefined>): MoneyRange | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export function optionStock(option: CatalogOptionRow): number {
  if (option.isBundle) return option.availableStock ?? 0;
  return option.inventory?.currentStock ?? 0;
}

export function activeOptions(row: CatalogMasterRow): CatalogOptionRow[] {
  return row.options
    .filter((o) => o.isActive && !o.isDeleted)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

export function mapCatalogListItem(row: CatalogMasterRow): ProductCatalogListItem {
  const options = activeOptions(row);
  const serial = toSerializable(row) as Record<string, unknown>;
  delete serial.options;
  return {
    ...serial,
    tags: Array.isArray(row.tags) ? row.tags : [],
    images: normalizeMasterImages(row.images),
    optionCount: options.length,
    representativeSku: options[0]?.sku ?? null,
    priceRange: range(options.map((o) => o.sellPrice)),
    costRange: range(options.map((o) => o.costPrice)),
    totalAvailableStock: options.reduce((sum, option) => sum + optionStock(option), 0),
  } as ProductCatalogListItem;
}

export function mapCatalogDetail(row: CatalogMasterRow): ProductCatalogDetail {
  return {
    ...mapCatalogListItem(row),
    options: activeOptions(row).map((o) => toSerializable(o)),
  } as ProductCatalogDetail;
}

export function mapCatalogCounts(rows: CatalogCountsRow[]): ProductCatalogCounts {
  return {
    total: rows.length,
    gradeA: rows.filter((r) => r.abcGrade === 'A').length,
    gradeB: rows.filter((r) => r.abcGrade === 'B').length,
    gradeC: rows.filter((r) => r.abcGrade === 'C').length,
    adCount: rows.filter((r) => !!r.adTier).length,
    noAdCount: rows.filter((r) => !r.adTier).length,
    draftCount: rows.filter((r) => r.pipelineStep === 'draft').length,
    processingCount: rows.filter((r) => r.pipelineStep === 'processing').length,
    processedCount: rows.filter((r) => r.pipelineStep === 'processed').length,
    discontinuedCount: rows.filter((r) => r.pipelineStep === 'discontinued').length,
    temporaryCount: rows.filter((r) => r.isTemporary).length,
  } satisfies ProductCatalogCounts;
}
