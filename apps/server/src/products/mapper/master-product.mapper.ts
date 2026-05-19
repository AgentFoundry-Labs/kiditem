import type { MasterImageItem } from '@kiditem/shared/product';
import type {
  MasterProductImageRow,
  MasterWithImageRows,
} from '../application/port/out/repository/master-product.repository.port';

type MasterWithSharedImages = Omit<MasterWithImageRows, 'tags' | 'images'> & {
  tags: string[];
  images: MasterImageItem[];
};

export function normalizeMasterTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === 'string');
}

export function toMasterImageItem(row: MasterProductImageRow): MasterImageItem {
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
 * Read-model row -> the shared-contract shape the controller boundary
 * serializes via `toSerializable` and parses via `MasterSchema`.
 */
export function withImageRows(row: MasterWithImageRows): MasterWithSharedImages {
  return {
    ...row,
    tags: normalizeMasterTags(row.tags),
    images: row.images.map(toMasterImageItem),
  };
}
