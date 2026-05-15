/**
 * Outgoing port for `products` catalog access from `sourcing` domain.
 *
 * apps/server/AGENTS.md (Reconstruction Rules): "Do not import concrete
 * `adapter/out/**` implementations or another owner domain service from
 * `application/service/**`." sourcing's promote use-case therefore depends on
 * this port; the concrete adapter is the only sourcing-side file that may
 * import a products-domain service.
 *
 * Bound in `sourcing.module.ts` to the concrete `SourcingProductsCatalogAdapter`
 * provider via `SOURCING_PRODUCTS_CATALOG_PORT` token.
 *
 * Phase 3 (#192): `createMaster` was retired and replaced with
 * `promoteCandidate(tx, organizationId, input)`. The caller is now sourcing's
 * `SourcingPromotionService`, which already owns a `prisma.$transaction`
 * (candidate row lock + status flip + master creation must commit together).
 * Passing the transaction client across the boundary keeps the promotion
 * atomic without leaking Prisma awareness into the port surface — the
 * concrete adapter type-narrows it to its products-domain consumer.
 */

import type { Prisma } from '@prisma/client';

export const SOURCING_PRODUCTS_CATALOG_PORT = Symbol('SOURCING_PRODUCTS_CATALOG_PORT');

/**
 * Snapshot of a sourcing candidate, materialized by the promote use-case
 * before the cross-domain call. The products domain does not query candidate
 * tables — sourcing is the owner.
 */
export interface PromoteCandidateInput {
  candidateSnapshot: {
    name: string;
    description: string;
    category: string | null;
    brand: string | null;
    tags: string[];
    thumbnailUrl: string | null;
    imageUrl: string | null;
    sourceImages: Array<{
      url: string;
      storageKey: string | null;
      sortOrder: number;
      isPrimary: boolean;
      source: string;
      role: string;
      label: string | null;
      mimeType?: string | null;
      width?: number | null;
      height?: number | null;
      fileSize?: number | null;
    }>;
  };
  options: Array<{
    optionName: string;
    legacyCode?: string;
    barcode?: string;
    sellPrice?: number;
    costPrice?: number;
    sortOrder?: number;
  }>;
}

export interface PromoteCandidateResult {
  masterId: string;
  masterCode: string;
}

export interface SourcingProductsCatalogPort {
  /**
   * Promote a sourcing candidate to an operational master.
   *
   * Implementation is owned by products domain via `MasterPromotionService`.
   * The caller (`SourcingPromotionService`) supplies `tx` so the candidate
   * row lock + status flip and the master/options/images creation commit in
   * the same transaction.
   */
  promoteCandidate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: PromoteCandidateInput,
  ): Promise<PromoteCandidateResult>;
}
