// apps/server/src/products/application/service/master-promotion.service.ts
import { Inject, Injectable } from '@nestjs/common';
import type {
  ProductMasterPromotionImageInput,
  ProductMasterPromotionInput,
  ProductMasterPromotionOptionInput,
  ProductMasterPromotionPort,
  ProductMasterPromotionResult,
} from '../port/in/master-promotion.port';
import {
  MASTER_CODE_PORT,
  type MasterCodePort,
} from '../port/out/repository/master-code.port';
import {
  MASTER_PRODUCT_REPOSITORY_PORT,
  type MasterProductRepositoryPort,
} from '../port/out/repository/master-product.repository.port';
import {
  PRODUCTS_TRANSACTION_PORT,
  type ProductsRepositoryTransaction,
  type ProductsTransactionPort,
} from '../port/out/transaction/products-transaction.port';
import { OptionsService } from './options.service';

/**
 * Image input passed by sourcing promotion. `role` and `source` are kept open
 * to accept the existing `SourcingMasterImageRole` set without re-modeling the
 * enum at this layer.
 */
export type MasterPromotionImageInput = ProductMasterPromotionImageInput;

export type MasterPromotionOptionInput = ProductMasterPromotionOptionInput;

/**
 * Composite input for products-domain `MasterPromotionService.create`.
 *
 * `candidateSnapshot` is the immutable view of the sourcing candidate at the
 * moment of promotion — the products service does not query candidate tables.
 * Sourcing's outgoing port adapter is responsible for materializing this
 * snapshot from a candidate row.
 */
export type MasterPromotionInput = ProductMasterPromotionInput;

export type MasterPromotionResult = ProductMasterPromotionResult;

/**
 * Products-domain composite that turns a sourcing-candidate snapshot into a
 * fully-formed operational master row + its options + its image gallery in a
 * single transaction.
 *
 * Owned writes (atomic):
 *   1. `MasterCodePort.generate(tx)` — sole code issuer per
 *      products/AGENTS.md "Core Rules" → `M-00000001` family code.
 *   2. Master repository create with `lifecycleState: 'active'` (Phase 1a
 *      additive lifecycle column, propagated through the products API surface
 *      in Phase 5). The legacy `sourceUrl` / `pipelineStep` columns were
 *      retired in Phase 8 — the schema no longer carries them.
 *   3. Repository image create from `candidateSnapshot.sourceImages`
 *      with `organizationId` + `masterId` injected on every row.
 *   4. For every option, `OptionsService.create(organizationId, dto, tx)` —
 *      reuses the existing service so SKU issuance (`buildOptionSku` +
 *      counter increment) and tenant-scope guards run inside the same
 *      transaction as the master create.
 *
 * `outerTx` opt-in: when sourcing's promote use-case already owns a
 * transaction (it does, so the candidate's `status='promoted'` flip and the
 * master creation commit together), pass it in. Otherwise the service opens
 * its own.
 *
 * Cross-domain contract: this is the ONLY entrypoint sourcing's
 * `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate` adapter is allowed to
 * call from the products domain (sourcing/AGENTS.md "Boundary Rules").
 */
@Injectable()
export class MasterPromotionService implements ProductMasterPromotionPort {
  constructor(
    @Inject(MASTER_PRODUCT_REPOSITORY_PORT)
    private readonly masters: MasterProductRepositoryPort,
    @Inject(MASTER_CODE_PORT)
    private readonly codeSvc: MasterCodePort,
    @Inject(PRODUCTS_TRANSACTION_PORT)
    private readonly transactions: ProductsTransactionPort,
    private readonly optionsSvc: OptionsService,
  ) {}

  async create(
    outerTx: ProductsRepositoryTransaction | undefined,
    organizationId: string,
    input: MasterPromotionInput,
  ): Promise<MasterPromotionResult> {
    const exec = async (tx: ProductsRepositoryTransaction): Promise<MasterPromotionResult> => {
      const masterCode = await this.codeSvc.generate(tx);

      const snap = input.candidateSnapshot;
      const created = await this.masters.createPromoted({
        organizationId,
        tx,
        images: snap.sourceImages,
        data: {
          organizationId,
          code: masterCode,
          name: snap.name,
          description: snap.description,
          category: snap.category,
          brand: snap.brand,
          tags: snap.tags,
          thumbnailUrl: snap.thumbnailUrl,
          imageUrl: snap.imageUrl,
          lifecycleState: 'active',
        },
      });

      for (const opt of input.options) {
        await this.optionsSvc.create(
          organizationId,
          {
            masterId: created.id,
            optionName: opt.optionName,
            legacyCode: opt.legacyCode,
            barcode: opt.barcode,
            sellPrice: opt.sellPrice,
            costPrice: opt.costPrice,
            sortOrder: opt.sortOrder,
          },
          tx,
        );
      }

      return { masterId: created.id, masterCode };
    };

    return outerTx
      ? exec(outerTx)
      : this.transactions.run(exec, { timeout: 15000 });
  }
}
