// apps/server/src/products/domain/bundle-component-rules.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

/**
 * Pure validation helpers for `BundleComponent` writes.
 *
 * These encode the products/CLAUDE.md "3-way invariant" without touching
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
    throw new ConflictException('self-reference');
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
  if (!bundleOpt) throw new NotFoundException('bundle option not found');
  if (!compOpt) throw new NotFoundException('component option not found');
  if (!bundleOpt.isBundle) {
    throw new BadRequestException('option is not a bundle');
  }
  if (compOpt.isBundle) {
    throw new BadRequestException('nested bundle not supported in Plan B1');
  }
  if (bundleOpt.companyId !== authCompanyId) {
    throw new ForbiddenException('cross-company not allowed');
  }
  if (compOpt.companyId !== bundleOpt.companyId) {
    throw new ForbiddenException('cross-company not allowed');
  }
}
