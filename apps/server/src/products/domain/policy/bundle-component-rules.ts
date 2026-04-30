// apps/server/src/products/domain/policy/bundle-component-rules.ts

export type BundleComponentRuleCode =
  | 'self-reference'
  | 'bundle-option-not-found'
  | 'component-option-not-found'
  | 'option-is-not-bundle'
  | 'nested-bundle-not-supported'
  | 'cross-company';

export class BundleComponentRuleError extends Error {
  constructor(
    readonly code: BundleComponentRuleCode,
    message: string,
  ) {
    super(message);
    this.name = 'BundleComponentRuleError';
  }
}

/**
 * Pure validation helpers for `BundleComponent` writes.
 *
 * These encode the products/AGENTS.md "3-way invariant" without touching
 * Prisma so they can be reused in the orchestration layer and unit-tested
 * in isolation.
 */
export interface BundleOptionForRules {
  id: string;
  companyId: string;
  isBundle: boolean;
}

export function ensureNotSelfReference(
  bundleOptionId: string,
  componentOptionId: string,
): void {
  if (bundleOptionId === componentOptionId) {
    throw new BundleComponentRuleError('self-reference', 'self-reference');
  }
}

/**
 * Validates the 3-way invariant for a new `BundleComponent`:
 *   - Both options exist (caller already filtered by `isDeleted: false`,
 *     so `null` here means tombstone or not-our-tenant — surface as 404).
 *   - `bundleOption.isBundle === true`.
 *   - `componentOption.isBundle === false` (Plan B1: no nested bundles).
 *   - `bundleOption.companyId === authCompanyId` (caller owns the bundle).
 *   - `componentOption.companyId === bundleOption.companyId`
 *     (cross-company composition forbidden).
 *
 * Asserts both options non-null on success so the caller's narrowed types
 * remain accurate.
 */
export function ensureBundleAndComponentInvariants(
  bundleOpt: BundleOptionForRules | null,
  compOpt: BundleOptionForRules | null,
  authCompanyId: string,
): asserts bundleOpt is BundleOptionForRules {
  if (!bundleOpt) {
    throw new BundleComponentRuleError(
      'bundle-option-not-found',
      'bundle option not found',
    );
  }
  if (!compOpt) {
    throw new BundleComponentRuleError(
      'component-option-not-found',
      'component option not found',
    );
  }
  if (!bundleOpt.isBundle) {
    throw new BundleComponentRuleError(
      'option-is-not-bundle',
      'option is not a bundle',
    );
  }
  if (compOpt.isBundle) {
    throw new BundleComponentRuleError(
      'nested-bundle-not-supported',
      'nested bundle not supported in Plan B1',
    );
  }
  if (bundleOpt.companyId !== authCompanyId) {
    throw new BundleComponentRuleError('cross-company', 'cross-company not allowed');
  }
  if (compOpt.companyId !== bundleOpt.companyId) {
    throw new BundleComponentRuleError('cross-company', 'cross-company not allowed');
  }
}
