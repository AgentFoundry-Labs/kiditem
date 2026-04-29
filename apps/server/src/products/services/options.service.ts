// apps/server/src/products/services/options.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma, ProductOption } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BundleStockService } from './bundle-stock.service';
import { CreateOptionDto } from '../dto/create-option.dto';
import { UpdateOptionDto } from '../dto/update-option.dto';
import { ListOptionsQuery } from '../dto/list-options.query';
import { buildOptionSku } from '../domain/product-option-sku';
import {
  applyTemporaryReasonClearing,
  classifyBundleFlip,
  stripProductOptionSystemFields,
} from '../domain/product-option-mutation-rules';
import {
  applyOptionPatch,
  assertNoBundleComponents,
  assertNotUsedAsComponent,
  createOptionWithSku,
  findBundleIdsUsingComponent,
  findCurrentOption,
  incrementMasterOptionCounter,
  restoreOptionRow,
  softDeleteOptionRow,
} from '../persistence/product-option.persistence';
import {
  findOptionByBarcode,
  findOptionById,
  findOptionBySku,
  listOptions,
  type OptionsListPage,
} from '../read-models/product-option-read-model';

/**
 * Application orchestration for `ProductOption` lifecycle.
 *
 * Invariants (all preserved across the Phase 3B split):
 *   - SKU generation runs inside a `$transaction` with the 2-step shape
 *     `masterProduct.updateMany({id, companyId, isDeleted:false})` →
 *     tenant-scoped `findFirst` reread → `productOption.create`. The race
 *     guard + TOCTOU + counter increment all live in
 *     `incrementMasterOptionCounter` so they cannot drift apart.
 *   - `availableStock` is materialized only by `BundleStockService.recompute`
 *     (ADR-0014). Update payloads strip `availableStock` via the system-
 *     fields rule; create writes `availableStock: null` unconditionally.
 *   - `update` always routes through `productOption.updateMany` so a bare-id
 *     write never touches `product_options`. Bundle-flip relation guards run
 *     in the same transaction as the patch.
 *   - `softDelete` triggers `BundleStockService.recompute` for every bundle
 *     that references the deleted option as a component, in the same
 *     transaction as the soft-delete write.
 *   - `findBySku` and `findByBarcode` use tenant-scoped `findFirst`; cross-
 *     tenant rows never enter the SQL path.
 *
 * Compose-able: every mutating method accepts an optional outer
 * `Prisma.TransactionClient` so Plan B2 sourcing/supplier-sync flows can
 * wrap CRUD + adjacent writes in one transaction. Caller must pass
 * `{ timeout: >= 15000 }` on the outer `$transaction` so cold-cache writes
 * and recompute fan-out have headroom beyond Prisma's 5 s default.
 */
@Injectable()
export class OptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  async create(
    companyId: string,
    dto: CreateOptionDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<ProductOption> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const master = await incrementMasterOptionCounter(tx, companyId, dto.masterId);
      const sku = buildOptionSku(master.code, master.optionCounter);
      const stripped = stripProductOptionSystemFields(dto);
      return createOptionWithSku(tx, companyId, dto.masterId, sku, stripped);
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  async list(companyId: string, q: ListOptionsQuery): Promise<OptionsListPage> {
    return listOptions(this.prisma, companyId, q);
  }

  async findById(
    companyId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<ProductOption> {
    return findOptionById(this.prisma, companyId, id, opts);
  }

  async findBySku(companyId: string, sku: string): Promise<ProductOption> {
    return findOptionBySku(this.prisma, companyId, sku);
  }

  async findByBarcode(companyId: string, barcode: string): Promise<ProductOption> {
    return findOptionByBarcode(this.prisma, companyId, barcode);
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateOptionDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<ProductOption> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const current = await findCurrentOption(tx, companyId, id);
      const flip = classifyBundleFlip(current.isBundle, dto.isBundle);
      if (flip === 'enable-to-disable') {
        await assertNoBundleComponents(tx, companyId, id);
      } else if (flip === 'disable-to-enable') {
        await assertNotUsedAsComponent(tx, companyId, id);
      }

      const stripped = stripProductOptionSystemFields(dto);
      const data = applyTemporaryReasonClearing(
        { ...stripped } as Prisma.ProductOptionUncheckedUpdateInput,
        dto,
      );
      return applyOptionPatch(tx, companyId, id, data);
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  async softDelete(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const exec = async (tx: Prisma.TransactionClient) => {
      await softDeleteOptionRow(tx, companyId, id);
      const bundleIds = await findBundleIdsUsingComponent(tx, companyId, id);
      for (const bundleId of bundleIds) {
        await this.bundleStock.recompute(companyId, bundleId, tx);
      }
    };
    await (outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 }));
  }

  async restore(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    await restoreOptionRow(outerTx ?? this.prisma, companyId, id);
  }
}
