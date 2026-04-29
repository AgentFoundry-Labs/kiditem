// apps/server/src/products/domain/service/master-image-normalizer.ts
//
// Pure write-side helpers for MasterProduct image arrays. No Prisma, no Nest.
// Read-path lenience (`normalizeMasterImages`) lives in the sibling
// `product-image-normalizer.ts` and is reused here for the write path.
import type { MasterImageItem } from '@kiditem/shared/product';
import { normalizeMasterImages } from './product-image-normalizer';

/**
 * Canonicalize a write-side image payload: same lenient parse as the read
 * path, then sort ascending by `sortOrder`. Used by create/update/replace and
 * to compute the representative `MasterProduct.imageUrl` cache.
 */
export function normalizeImagesForWrite(images: unknown): MasterImageItem[] {
  return normalizeMasterImages(images).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * `MasterProduct.imageUrl` cache — primary if marked, else first item, else
 * null. Mirrors the read-side selection used by list cards / detail headers.
 */
export function representativeImageUrl(images: MasterImageItem[]): string | null {
  return images.find((img) => img.isPrimary)?.url ?? images[0]?.url ?? null;
}

/**
 * Index of the row that should carry `isPrimary=true` on insert. Explicit
 * `isPrimary` wins; otherwise the first row is primary. -1 when empty.
 */
export function primaryImageIndex(images: MasterImageItem[]): number {
  if (images.length === 0) return -1;
  const explicit = images.findIndex((img) => img.isPrimary === true);
  return explicit >= 0 ? explicit : 0;
}
