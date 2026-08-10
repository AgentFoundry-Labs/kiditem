/**
 * Collection is an operational concern, not a reviewed-source lifecycle.
 *
 * Keep this list deliberately small and explicit: a new collector cannot
 * become externally reachable merely because a client supplies its key. An
 * organization can opt out of an allowed source with a single enabled flag.
 */
export const ALLOWED_SOURCING_COLLECTION_SOURCES = [
  '1688.hot_product',
  '1688.image_search',
  '1688.product_extension',
  'alibaba.product_extension',
  'coupang.wing_catalog',
  'naver.autocomplete',
  'naver.datalab_popular',
  'naver.datalab_trend',
  'naver.searchad_keyword',
  'naver.trend',
  'shortstrend.trend',
  'tiktok.creative',
  'taobao.live',
  'taobao.live_commerce',
] as const;

export type AllowedSourcingCollectionSource =
  (typeof ALLOWED_SOURCING_COLLECTION_SOURCES)[number];

const allowedSources = new Set<string>(ALLOWED_SOURCING_COLLECTION_SOURCES);

export function isAllowedSourcingCollectionSource(sourceKey: string): boolean {
  return allowedSources.has(sourceKey);
}

export function collectionSourceDeniedReason(sourceKey: string):
  | 'source_not_allowed'
  | 'source_disabled' {
  return isAllowedSourcingCollectionSource(sourceKey)
    ? 'source_disabled'
    : 'source_not_allowed';
}
