export const COLLECTION_FRESHNESS_REPOSITORY_PORT = Symbol(
  'COLLECTION_FRESHNESS_REPOSITORY_PORT',
);

/**
 * When each source last completed a collection.
 *
 * `source_import_runs` is the ledger every source owner already writes its runs
 * to, keyed by `sourceType`. The dashboard's collection row had no state at all
 * because nothing read it — not because the fact was missing.
 *
 * Only completed runs count. A failed run is not a collection, and reading its
 * timestamp would tell an operator their data is fresh at the exact moment it
 * is not.
 */
export interface CollectionFreshnessRepositoryPort {
  readLastCompleted(organizationId: string): Promise<ReadonlyMap<string, Date>>;
}
