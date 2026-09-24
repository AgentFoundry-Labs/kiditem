/**
 * Stable hashes of Coupang catalog collection chunks and snapshots. The caller
 * supplies `sha256`, so this module stays free of crypto and runtime IO; the
 * collection service and the catalog repository adapters share it (KID-258).
 */
import type { CanonicalProduct, CatalogCollectionChunk } from './catalog-chunk-snapshot';

export function hashCatalogChunkPayload(payload: unknown, sha256: (value: string) => string): string {
  return sha256(stableStringify(payload));
}

export function hashCatalogChunkReceipts(chunks: CatalogCollectionChunk[], sha256: (value: string) => string): string {
  return hashCatalogChunkPayload(
    chunks
      .map(({ id, kind, sequence, checksum, itemCount }) => ({
        id,
        kind,
        sequence,
        checksum,
        itemCount,
      }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.sequence - b.sequence), sha256,
  );
}

export function hashCoupangCatalogSnapshot(products: CanonicalProduct[], sha256: (value: string) => string): string {
  const canonical = [...products].sort((a, b) => a.ordinal - b.ordinal);
  return sha256(stableStringify({ version: 1, products: canonical }));
}

export function hashCatalogStageSnapshot(products: Array<{ ordinal: number; product: unknown }>, sha256: (value: string) => string): string {
  const canonical = [...products].sort((a, b) => a.ordinal - b.ordinal);
  return sha256(stableStringify({ version: 1, products: canonical }));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`;
}
