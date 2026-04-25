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

/**
 * Normalize legacy `MasterProduct.images` JSON into canonical `MasterImageItem[]`.
 *
 * - `null | undefined | non-array` → `[]` (read-path lenience; writes go through DTO validator)
 * - `string[]` legacy shape → synthesized `{ url, role: 'product', label: null, sortOrder: i }`
 * - structured items → canonicalize: unknown roles fall back to `'product'`, label coerces to null
 *
 * The role enum is the canonical source of truth (`MasterImageRoleSchema`); any legacy free-string
 * role in persisted data is collapsed to the default rather than thrown, because hard-throw here
 * would brick listing reads whenever a historical row survived the PR #42 product-contract slice.
 */
export function normalizeMasterImages(raw: unknown): MasterImageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index): MasterImageItem[] => {
    if (typeof item === 'string' && item.length > 0) {
      return [{ url: item, role: DEFAULT_ROLE, label: null, sortOrder: index }];
    }
    if (!isRecord(item) || typeof item.url !== 'string' || item.url.length === 0) {
      return [];
    }
    return [{
      url: item.url,
      role: coerceRole(item.role),
      label: coerceLabel(item.label),
      sortOrder: typeof item.sortOrder === 'number' && Number.isInteger(item.sortOrder)
        ? item.sortOrder
        : index,
    }];
  });
}

export function withNormalizedMasterImages<T extends { images: unknown }>(row: T): Omit<T, 'images'> & { images: MasterImageItem[] } {
  return { ...row, images: normalizeMasterImages(row.images) };
}
