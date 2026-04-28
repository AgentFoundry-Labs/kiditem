import { MasterImageRoleSchema, type MasterImageItem, type MasterImageRole } from '@kiditem/shared';

// Derive from the shared enum so a new role added to MasterImageRoleSchema
// propagates here automatically (external review LOW — drift prevention).
const VALID_ROLES: ReadonlySet<MasterImageRole> = new Set(MasterImageRoleSchema.options);

const DEFAULT_ROLE: MasterImageRole = 'product';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coerceRole(raw: unknown): MasterImageRole {
  return typeof raw === 'string' && VALID_ROLES.has(raw as MasterImageRole)
    ? (raw as MasterImageRole)
    : DEFAULT_ROLE;
}

function coerceLabel(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return raw;
  return null;
}

function optionalString(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return typeof raw === 'string' ? raw : undefined;
}

function optionalPositiveInt(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

function optionalNonNegativeInt(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}

/**
 * Normalize API/table image rows into canonical `MasterImageItem[]`.
 *
 * - `null | undefined | non-array` → `[]` (read-path lenience; writes go through DTO validator)
 * - structured items → canonicalize: unknown roles fall back to `'product'`, label coerces to null
 *
 * The role enum is the canonical source of truth (`MasterImageRoleSchema`). We collapse
 * invalid role strings to `product` so one malformed row cannot break product list reads.
 */
export function normalizeMasterImages(raw: unknown): MasterImageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index): MasterImageItem[] => {
    if (!isRecord(item) || typeof item.url !== 'string' || item.url.length === 0) {
      return [];
    }
    const sortOrder = typeof item.sortOrder === 'number' && Number.isInteger(item.sortOrder) && item.sortOrder >= 0
      ? item.sortOrder
      : index;
    return [{
      ...(typeof item.id === 'string' ? { id: item.id } : {}),
      url: item.url,
      ...(optionalString(item.storageKey) !== undefined ? { storageKey: optionalString(item.storageKey) } : {}),
      role: coerceRole(item.role),
      label: coerceLabel(item.label),
      sortOrder,
      ...(typeof item.source === 'string' ? { source: item.source } : {}),
      ...(optionalString(item.mimeType) !== undefined ? { mimeType: optionalString(item.mimeType) } : {}),
      ...(optionalPositiveInt(item.width) !== undefined ? { width: optionalPositiveInt(item.width) } : {}),
      ...(optionalPositiveInt(item.height) !== undefined ? { height: optionalPositiveInt(item.height) } : {}),
      ...(optionalNonNegativeInt(item.fileSize) !== undefined ? { fileSize: optionalNonNegativeInt(item.fileSize) } : {}),
      ...(typeof item.isPrimary === 'boolean' ? { isPrimary: item.isPrimary } : {}),
    }];
  });
}

export function withNormalizedMasterImages<T extends { images: unknown }>(row: T): Omit<T, 'images'> & { images: MasterImageItem[] } {
  return { ...row, images: normalizeMasterImages(row.images) };
}
