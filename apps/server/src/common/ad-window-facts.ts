/**
 * Compatibility export for existing consumers. The canonical ledger reader is
 * owned by Advertising under `advertising/read/ad-target-facts`.
 */
export {
  adSweepCoversChannelAccount,
  advertisingApplies,
  advertisingAppliesToSale,
  dayAfter,
  readAdWindowFacts,
  readLatestAdDate,
  readListingAdWindowFacts,
} from '../advertising/read/ad-target-facts';
export type {
  AdListingWindowFacts,
  AdWindowDay,
  AdWindowFacts,
} from '../advertising/read/ad-target-facts';
