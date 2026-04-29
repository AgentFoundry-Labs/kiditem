// apps/server/src/products/mapper/master-product.mapper.ts
//
// Prisma row → shared contract shape for MasterProduct + nested image rows.
// Pure module — depends on `@kiditem/shared/product` types only.
import type { MasterProduct, MasterProductImage } from '@prisma/client';
import type { MasterImageItem } from '@kiditem/shared/product';
import type { MasterWithImageRows } from '../adapter/out/prisma/master-product.query';

export function toMasterImageItem(row: MasterProductImage): MasterImageItem {
  return {
    id: row.id,
    url: row.url,
    storageKey: row.storageKey,
    role: row.role as MasterImageItem['role'],
    label: row.label,
    sortOrder: row.sortOrder,
    source: row.source,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    fileSize: row.fileSize,
    isPrimary: row.isPrimary,
  };
}

/**
 * Read-model row → the `MasterProduct & { images: MasterImageItem[] }` shape
 * the controller boundary serializes via `toSerializable` and parses via
 * `MasterSchema`. Cast through `unknown` is required because the Prisma
 * `MasterProduct` type does not include the nested `images` field.
 */
export function withImageRows(row: MasterWithImageRows): MasterProduct {
  return { ...row, images: row.images.map(toMasterImageItem) } as unknown as MasterProduct;
}
