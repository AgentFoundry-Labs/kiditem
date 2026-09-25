/**
 * Republishing one mall catalog photo onto its existing `content_assets` row.
 *
 * Mall-neutral rule (KID-350): the row keeps its stored copy (`storage_key`,
 * `mime_type`, `width`, `height`, `file_size` and the `materialization*`
 * metadata keys) while its URL stays the same, because a provider image URL
 * names its content. Only a URL change clears the copy. An operator-selected
 * representative row keeps its own URL, copy and metadata as before.
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
  | {
      kind: 'update';
      url: string;
      role: string;
      sortOrder: number;
      storage: CatalogAssetStorage;
      metadata: Record<string, unknown>;
    };

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
  const keepsCopy = options.preservesManualSelection || existing.url === url;
  const base = keepsCopy ? existing.metadata : withoutKeys(existing.metadata, MATERIALIZATION_KEYS);
  const metadata = { ...base, ...observation.publicationMetadata };
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
