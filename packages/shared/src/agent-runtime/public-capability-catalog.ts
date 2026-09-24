/**
 * Stable capability names that may be included in Gateway tool-status events.
 * This is deliberately a key-only runtime contract, not a business capability
 * definition or invocation authority.
 */
export const PUBLIC_CAPABILITY_CATALOG_KEYS = Object.freeze([
  'analytics.readOverview',
  'channels.get_target_execution',
  'channels.prepare_target_execution',
  'channels.register_confirmed_listing',
  'channels.report_target_execution',
  'channels.start_target_execution',
  'channels.submit_wing_thumbnail',
  'products.create_listing_generation_package',
  'sourcing.createReviewBatch',
  'sourcing.duplicateCheck',
  'sourcing.ingestCandidate',
  'sourcing.inspectRecommendationRun',
  'sourcing.refreshValidation',
  'sourcing.retrieveWorkspaceEvidence',
  'sourcing.scrapeProductUrl',
  'supply.create_purchase_order_draft',
  'supply.submit_purchase_order',
] as const);

export type PublicCapabilityCatalogKey =
  (typeof PUBLIC_CAPABILITY_CATALOG_KEYS)[number];
