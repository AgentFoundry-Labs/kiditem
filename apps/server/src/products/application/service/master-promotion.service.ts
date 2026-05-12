// apps/server/src/products/application/service/master-promotion.service.ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MasterCodeService } from '../../adapter/out/prisma/master-code.service';
import { OptionsService } from './options.service';

/**
 * Image input passed by sourcing promotion. `role` and `source` are kept open
 * to accept the existing `SourcingMasterImageRole` set without re-modeling the
 * enum at this layer.
 */
export interface MasterPromotionImageInput {
  url: string;
  storageKey: string | null;
  sortOrder: number;
  isPrimary: boolean;
  source: string;
  role: string;
  label: string | null;
}

export interface MasterPromotionOptionInput {
  optionName: string;
  legacyCode?: string;
  barcode?: string;
  sellPrice?: number;
  costPrice?: number;
  sortOrder?: number;
}

/**
 * Composite input for products-domain `MasterPromotionService.create`.
 *
 * `candidateSnapshot` is the immutable view of the sourcing candidate at the
 * moment of promotion — the products service does not query candidate tables.
 * Sourcing's outgoing port adapter is responsible for materializing this
 * snapshot from a candidate row.
 */
export interface MasterPromotionInput {
  candidateSnapshot: {
    name: string;
    description: string;
    category: string | null;
    brand: string | null;
    tags: string[];
    thumbnailUrl: string | null;
    imageUrl: string | null;
    sourceImages: MasterPromotionImageInput[];
  };
  options: MasterPromotionOptionInput[];
}

export interface MasterPromotionResult {
  masterId: string;
  masterCode: string;
}

/**
 * Products-domain composite that turns a sourcing-candidate snapshot into a
 * fully-formed operational master row + its options + its image gallery in a
 * single transaction.
 *
 * Owned writes (atomic):
 *   1. `MasterCodeService.generate(tx)` — sole code issuer per
 *      products/AGENTS.md "Core Rules" → `M-00000001` family code.
 *   2. `tx.masterProduct.create` with `lifecycleState: 'active'` (Phase 1a
 *      additive lifecycle column, propagated through the products API surface
 *      in Phase 5). The legacy `sourceUrl` / `pipelineStep` columns were
 *      retired in Phase 8 — the schema no longer carries them.
 *   3. `tx.masterProductImage.createMany` from `candidateSnapshot.sourceImages`
 *      with `organizationId` + `masterId` injected on every row.
 *   4. For every option, `OptionsService.create(organizationId, dto, tx)` —
 *      reuses the existing service so SKU issuance (`buildOptionSku` +
 *      counter increment) and tenant-scope guards run inside the same
 *      transaction as the master create.
 *
 * `outerTx` opt-in: when sourcing's promote use-case already owns a
 * `$transaction` (it does, so the candidate's `status='promoted'` flip and the
 * master creation commit together), pass it in. Otherwise the service opens
 * its own.
 *
 * Cross-domain contract: this is the ONLY entrypoint sourcing's
 * `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate` adapter is allowed to
 * call from the products domain (sourcing/AGENTS.md "Boundary Rules").
 */
@Injectable()
export class MasterPromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSvc: MasterCodeService,
    private readonly optionsSvc: OptionsService,
  ) {}

  async create(
    outerTx: Prisma.TransactionClient | undefined,
    organizationId: string,
    input: MasterPromotionInput,
  ): Promise<MasterPromotionResult> {
    const exec = async (tx: Prisma.TransactionClient): Promise<MasterPromotionResult> => {
      const masterCode = await this.codeSvc.generate(tx);

      const snap = input.candidateSnapshot;
      const created = await tx.masterProduct.create({
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
        } as Prisma.MasterProductUncheckedCreateInput,
        select: { id: true },
      });

      if (snap.sourceImages.length > 0) {
        await tx.masterProductImage.createMany({
          data: snap.sourceImages.map((img) => ({
            organizationId,
            masterId: created.id,
            url: img.url,
            storageKey: img.storageKey,
            role: img.role,
            label: img.label,
            sortOrder: img.sortOrder,
            source: img.source,
            isPrimary: img.isPrimary,
          })),
        });
      }

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
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }
}
