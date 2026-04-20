/**
 * @deprecated Use `./option-pricing-resolver` directly.
 *
 * Backward-compat re-export shim. The implementation was moved to
 * `option-pricing-resolver.ts` with a nested-only interface (v2 spec §4.4).
 * This file will be deleted in Plan B2c.dashboard T17 cleanup.
 */
export {
  resolvePricing,
  type ResolvePricingInput,
  type ResolvedPricing,
} from './option-pricing-resolver';
