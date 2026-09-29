/**
 * Republishing one mall catalog photo onto its existing `content_assets` row.
 *
 * Mall-neutral rule (KID-350): the row keeps its stored copy (`storage_key`,
 * `mime_type`, `width`, `height`, `file_size` and the `materialization*`
 * metadata keys) while its URL stays the same, because a provider image URL
 * names its content. Only a URL change clears the copy. An operator-selected
 * representative row keeps its own URL and stored copy; publication fields are
 * still written over its metadata.
 *
 * A row whose URL, role, order, deletion flag and metadata are all unchanged
 * is not updated. The publication history keys are left out of that
 * comparison, so on an unchanged row `publicationReference` names the last
 * publication that changed it, not the latest one that observed it.
 */

export interface CatalogAssetStorage {
  storageKey: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
}

export interface StoredCatalogAsset {
  url: string;
  role: string | null;
  sortOrder: number;
  isDeleted: boolean;
  metadata: Record<string, unknown>;
  storage: CatalogAssetStorage;
}

export interface CatalogAssetObservation {
  sourceUrl: string;
  role: string;
  sortOrder: number;
  /** Fields this publication writes over the stored metadata. */
  publicationMetadata: Record<string, unknown>;
}

export type CatalogAssetRepublication =
  | { kind: 'unchanged' }
  | {
      kind: 'update';
      url: string;
      role: string;
      sortOrder: number;
      storage: CatalogAssetStorage;
      metadata: Record<string, unknown>;
    };

/** Keys a publication writes to record which publication last wrote the row. */
const WRITTEN_PUBLICATION_HISTORY_KEYS = ['publicationReference', 'publicationScope'] as const;

/**
 * Run-named keys older publications wrote and none writes now. Stored rows still carry them, so they stay
 * out of the comparison: otherwise their absence from a new publication would rewrite every catalog asset.
 * A row rewritten for another reason drops them.
 */
const RETIRED_PUBLICATION_HISTORY_KEYS = ['sourceImportRunId', 'lastImportRunId'] as const;

/** Keys that record which publication last wrote the row; they never make a row "changed". */
export const CATALOG_PUBLICATION_HISTORY_KEYS = [
  ...WRITTEN_PUBLICATION_HISTORY_KEYS,
  ...RETIRED_PUBLICATION_HISTORY_KEYS,
] as const;

/** The history keys a publication writes. */
export type CatalogPublicationHistoryKey = (typeof WRITTEN_PUBLICATION_HISTORY_KEYS)[number];

const MATERIALIZATION_KEYS = [
  'materializationStatus',
  'materializedAtMs',
  'materializationLeaseToken',
  'materializationLeaseExpiresAtMs',
  'materializationAttemptCount',
  'materializationError',
  'nextMaterializationAttemptAtMs',
] as const;

const EMPTY_STORAGE: CatalogAssetStorage = {
  storageKey: null,
  mimeType: null,
  width: null,
  height: null,
  fileSize: null,
};

export function planCatalogAssetRepublication(
  existing: StoredCatalogAsset,
  observation: CatalogAssetObservation,
  options: { preservesManualSelection: boolean },
): CatalogAssetRepublication {
  const url = options.preservesManualSelection ? existing.url : observation.sourceUrl;
  // An operator-selected row publishes its own URL, so it always keeps its copy.
  const keepsCopy = existing.url === url;
  const kept = withoutKeys(existing.metadata, RETIRED_PUBLICATION_HISTORY_KEYS);
  const base = keepsCopy ? kept : withoutKeys(kept, MATERIALIZATION_KEYS);
  const metadata = { ...base, ...observation.publicationMetadata };
  const unchanged = keepsCopy
    && !existing.isDeleted
    && existing.role === observation.role
    && existing.sortOrder === observation.sortOrder
    && canonicalJson(withoutKeys(existing.metadata, CATALOG_PUBLICATION_HISTORY_KEYS))
      === canonicalJson(withoutKeys(metadata, CATALOG_PUBLICATION_HISTORY_KEYS));
  if (unchanged) return { kind: 'unchanged' };
  return {
    kind: 'update',
    url,
    role: observation.role,
    sortOrder: observation.sortOrder,
    storage: keepsCopy ? { ...existing.storage } : { ...EMPTY_STORAGE },
    metadata,
  };
}

function withoutKeys(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const result = { ...metadata };
  for (const key of keys) delete result[key];
  return result;
}

/** JSON text with sorted object keys, matching how jsonb compares values. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0),
        )
      : item);
}
