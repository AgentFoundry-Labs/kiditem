/**
 * Compatibility export for existing consumers. The canonical ledger reader is
 * owned by Advertising under `advertising/read/ad-target-facts`.
 */
export {
  advertisingApplies,
  dayAfter,
  readAdWindowFacts,
  readLatestAdDate,
  readListingAdWindowFacts,
  readListingDayAdFacts,
} from '../advertising/read/ad-target-facts';
export type {
  AdListingDayFacts,
  AdListingWindowFacts,
  AdWindowDay,
  AdWindowFacts,
} from '../advertising/read/ad-target-facts';
