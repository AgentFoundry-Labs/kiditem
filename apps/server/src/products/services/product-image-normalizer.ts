import type { MasterImageItem } from '@kiditem/shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeMasterImages(raw: unknown): MasterImageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index): MasterImageItem[] => {
    if (typeof item === 'string' && item.length > 0) {
      return [{ url: item, role: '', label: '', sortOrder: index }];
    }
    if (!isRecord(item) || typeof item.url !== 'string' || item.url.length === 0) {
      return [];
    }
    return [{
      url: item.url,
      role: typeof item.role === 'string' ? item.role : '',
      label: typeof item.label === 'string' ? item.label : '',
      sortOrder: typeof item.sortOrder === 'number' && Number.isInteger(item.sortOrder)
        ? item.sortOrder
        : index,
    }];
  });
}

export function withNormalizedMasterImages<T extends { images: unknown }>(row: T): Omit<T, 'images'> & { images: MasterImageItem[] } {
  return { ...row, images: normalizeMasterImages(row.images) };
}
