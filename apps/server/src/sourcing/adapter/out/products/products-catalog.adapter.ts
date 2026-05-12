import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { MasterPromotionService } from '../../../../products/application/service/master-promotion.service';
import type {
  PromoteCandidateInput,
  PromoteCandidateResult,
  SourcingProductsCatalogPort,
} from '../../../application/port/out/products-catalog.port';

/**
 * Concrete adapter for `SOURCING_PRODUCTS_CATALOG_PORT`.
 *
 * This is the only sourcing-side file that imports a products-domain service,
 * per sourcing/AGENTS.md "Boundary Rules" and apps/server/AGENTS.md
 * "Reconstruction Rules" (application services depend on ports; concrete
 * adapters bridge ports to other-domain services).
 *
 * `MasterPromotionService.create` owns the products-side invariants:
 * `MasterCodeService.generate(tx)` for the family code, master row write with
 * `lifecycleState='active'`, image gallery createMany, and per-option
 * `OptionsService.create` so SKU issuance + tenant guards run inside the same
 * transaction.
 */
@Injectable()
export class SourcingProductsCatalogAdapter implements SourcingProductsCatalogPort {
  constructor(private readonly promotion: MasterPromotionService) {}

  async promoteCandidate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: PromoteCandidateInput,
  ): Promise<PromoteCandidateResult> {
    return this.promotion.create(tx, organizationId, input);
  }
}
