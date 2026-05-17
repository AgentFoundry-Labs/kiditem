import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  PRODUCT_MASTER_PROMOTION_PORT,
  type ProductMasterPromotionPort,
} from '../../../../products/application/port/in/master-promotion.port';
import type {
  PromoteCandidateInput,
  PromoteCandidateResult,
  SourcingProductsCatalogPort,
} from '../../../application/port/out/products-catalog.port';

/**
 * Concrete adapter for `SOURCING_PRODUCTS_CATALOG_PORT`.
 *
 * This is the only sourcing-side file that imports the products owner-side
 * promotion port token, per sourcing/AGENTS.md "Boundary Rules" and
 * apps/server/AGENTS.md "Reconstruction Rules" (application services depend on
 * local ports; concrete adapters bridge to other-domain owner ports).
 *
 * The products owner-side master promotion port owns the products invariants:
 * `MasterCodeService.generate(tx)` for the family code, master row write with
 * `lifecycleState='active'`, image gallery createMany, and per-option
 * `OptionsService.create` so SKU issuance + tenant guards run inside the same
 * transaction.
 */
@Injectable()
export class SourcingProductsCatalogAdapter implements SourcingProductsCatalogPort {
  constructor(
    @Inject(PRODUCT_MASTER_PROMOTION_PORT)
    private readonly promotion: ProductMasterPromotionPort,
  ) {}

  async promoteCandidate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: PromoteCandidateInput,
  ): Promise<PromoteCandidateResult> {
    return this.promotion.create(tx, organizationId, input);
  }
}
