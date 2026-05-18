// apps/server/src/products/application/service/options.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { BundleStockService } from './bundle-stock.service';
import { CreateOptionDto } from '../../dto/create-option.dto';
import { UpdateOptionDto } from '../../dto/update-option.dto';
import { ListOptionsQuery } from '../../dto/list-options.query';
import { buildOptionSku } from '../../domain/service/product-option-sku';
import {
  applyTemporaryReasonClearing,
  classifyBundleFlip,
  stripProductOptionSystemFields,
} from '../../domain/policy/product-option-mutation-rules';
import {
  PRODUCT_OPTION_REPOSITORY_PORT,
  type OptionsListPage,
  type ProductOptionRepositoryPort,
  type ProductOptionRow,
} from '../port/out/product-option.repository.port';
import {
  PRODUCTS_TRANSACTION_PORT,
  type ProductsRepositoryTransaction,
  type ProductsTransactionPort,
} from '../port/out/products-transaction.port';

/**
 * Application orchestration for `ProductOption` lifecycle.
 *
 * Invariants (all preserved across the Phase 3B split):
 *   - SKU generation runs inside a `$transaction` with the 2-step shape
 *     `masterProduct.updateMany({id, organizationId, isDeleted:false})` →
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
 * repository transaction so Plan B2 sourcing/supplier-sync flows can wrap
 * CRUD + adjacent writes in one transaction. Caller must pass
 * `{ timeout: >= 15000 }` on the outer transaction so cold-cache writes and
 * recompute fan-out have headroom.
 */
@Injectable()
export class OptionsService {
  constructor(
    @Inject(PRODUCT_OPTION_REPOSITORY_PORT)
    private readonly options: ProductOptionRepositoryPort,
    @Inject(PRODUCTS_TRANSACTION_PORT)
    private readonly transactions: ProductsTransactionPort,
    private readonly bundleStock: BundleStockService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateOptionDto,
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<ProductOptionRow> {
    const exec = async (tx: ProductsRepositoryTransaction) => {
      const master = await this.options.incrementMasterOptionCounter(tx, organizationId, dto.masterId);
      const sku = buildOptionSku(master.code, master.optionCounter);
      const stripped = stripProductOptionSystemFields(dto);
      return this.options.createOptionWithSku(tx, organizationId, dto.masterId, sku, stripped);
    };
    return outerTx
      ? exec(outerTx)
      : this.transactions.run(exec, { timeout: 15000 });
  }

  async list(organizationId: string, q: ListOptionsQuery): Promise<OptionsListPage> {
    return this.options.list(organizationId, q);
  }

  async findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<ProductOptionRow> {
    return this.options.findById(organizationId, id, opts);
  }

  async findBySku(organizationId: string, sku: string): Promise<ProductOptionRow> {
    return this.options.findBySku(organizationId, sku);
  }

  async findByBarcode(organizationId: string, barcode: string): Promise<ProductOptionRow> {
    return this.options.findByBarcode(organizationId, barcode);
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateOptionDto,
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<ProductOptionRow> {
    const exec = async (tx: ProductsRepositoryTransaction) => {
      const current = await this.options.findCurrentOption(tx, organizationId, id);
      const flip = classifyBundleFlip(current.isBundle, dto.isBundle);
      if (flip === 'enable-to-disable') {
        await this.options.assertNoBundleComponents(tx, organizationId, id);
      } else if (flip === 'disable-to-enable') {
        await this.options.assertNotUsedAsComponent(tx, organizationId, id);
      }

      const stripped = stripProductOptionSystemFields(dto);
      const data = applyTemporaryReasonClearing(
        { ...stripped } as Record<string, unknown>,
        dto,
      );
      return this.options.applyOptionPatch(tx, organizationId, id, data);
    };
    return outerTx
      ? exec(outerTx)
      : this.transactions.run(exec, { timeout: 15000 });
  }

  async softDelete(
    organizationId: string,
    id: string,
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<void> {
    const exec = async (tx: ProductsRepositoryTransaction) => {
      await this.options.softDeleteOptionRow(tx, organizationId, id);
      const bundleIds = await this.options.findBundleIdsUsingComponent(tx, organizationId, id);
      for (const bundleId of bundleIds) {
        await this.bundleStock.recompute(organizationId, bundleId, tx);
      }
    };
    await (outerTx
      ? exec(outerTx)
      : this.transactions.run(exec, { timeout: 15000 }));
  }

  async restore(
    organizationId: string,
    id: string,
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<void> {
    await this.options.restoreOptionRow(organizationId, id, outerTx);
  }
}
