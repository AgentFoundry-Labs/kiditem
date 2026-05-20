// apps/server/src/products/application/service/bundle-components.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { BundleStockService } from './bundle-stock.service';
import { CreateBundleComponentDto } from '../../dto/create-bundle-component.dto';
import { UpdateBundleComponentDto } from '../../dto/update-bundle-component.dto';
import { ListBundleComponentsQuery } from '../../dto/list-bundle-components.query';
import { mapPrismaError } from '../../util/prisma-error';
import {
  BundleComponentRuleError,
  type BundleOptionForRules,
  ensureBundleAndComponentInvariants,
  ensureNotSelfReference,
} from '../../domain/policy/bundle-component-rules';
import {
  PRODUCT_BUNDLE_REPOSITORY_PORT,
  type BundleComponentRow,
  type ProductBundleRepositoryPort,
} from '../port/out/repository/product-bundle.repository.port';
import {
  PRODUCTS_TRANSACTION_PORT,
  type ProductsRepositoryTransaction,
  type ProductsTransactionPort,
} from '../port/out/transaction/products-transaction.port';

function mapBundleComponentRuleError(error: unknown): never {
  if (!(error instanceof BundleComponentRuleError)) throw error;
  switch (error.code) {
    case 'self-reference':
      throw new ConflictException(error.message);
    case 'bundle-option-not-found':
    case 'component-option-not-found':
      throw new NotFoundException(error.message);
    case 'option-is-not-bundle':
    case 'nested-bundle-not-supported':
      throw new BadRequestException(error.message);
    case 'cross-organization':
      throw new ForbiddenException(error.message);
  }
}

function ensureNotSelfReferenceForHttp(
  bundleOptionId: string,
  componentOptionId: string,
): void {
  try {
    ensureNotSelfReference(bundleOptionId, componentOptionId);
  } catch (error) {
    mapBundleComponentRuleError(error);
  }
}

function ensureBundleAndComponentInvariantsForHttp(
  bundleOpt: BundleOptionForRules | null,
  compOpt: BundleOptionForRules | null,
  authOrganizationId: string,
): asserts bundleOpt is BundleOptionForRules {
  try {
    ensureBundleAndComponentInvariants(bundleOpt, compOpt, authOrganizationId);
  } catch (error) {
    mapBundleComponentRuleError(error);
  }
}

/**
 * Bundle composition CRUD orchestration.
 *
 * Ownership / isolation invariants (products/AGENTS.md) are enforced by the
 * pure helpers in `domain/bundle-component-rules.ts`. The row-lock + scoped
 * write/delete + recompute chain runs through `persistence/`. This service
 * stitches them together inside one transaction so the bundle option lock
 * is held for the entire validate→mutate→recompute window.
 *
 * Each mutating method accepts an optional `outerTx?` so Plan B2 sourcing /
 * supplier-sync flows can wrap CRUD + other writes in a single transaction.
 * Callers must pass `{ timeout: >= 15000 }` on the outer `$transaction` so
 * the lock + recompute chain has headroom beyond Prisma's 5 s default.
 */
@Injectable()
export class BundleComponentsService {
  constructor(
    @Inject(PRODUCT_BUNDLE_REPOSITORY_PORT)
    private readonly bundles: ProductBundleRepositoryPort,
    @Inject(PRODUCTS_TRANSACTION_PORT)
    private readonly transactions: ProductsTransactionPort,
    private readonly bundleStock: BundleStockService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateBundleComponentDto,
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<BundleComponentRow> {
    ensureNotSelfReferenceForHttp(dto.bundleOptionId, dto.componentOptionId);

    const { bundleOpt, compOpt } = await this.bundles.findBundleRuleOptions({
      organizationId,
      bundleOptionId: dto.bundleOptionId,
      componentOptionId: dto.componentOptionId,
      tx: outerTx,
    });
    ensureBundleAndComponentInvariantsForHttp(bundleOpt, compOpt, organizationId);

    const exec = async (
      tx: ProductsRepositoryTransaction,
    ): Promise<BundleComponentRow> => {
      await this.bundles.lockBundleOptionRow(tx, dto.bundleOptionId, organizationId);
      try {
        const bc = await this.bundles.createBundleComponent(tx, {
          bundleOptionId: dto.bundleOptionId,
          componentOptionId: dto.componentOptionId,
          qty: dto.qty,
          // 3-way invariant: derive from bundle, not auth organizationId.
          organizationId: bundleOpt.organizationId,
        });
        await this.bundleStock.recompute(organizationId, dto.bundleOptionId, tx);
        return bc;
      } catch (e) {
        // mapPrismaError returns `never` — TS narrows the try-block happy path.
        mapPrismaError(e, 'bundle-component create');
      }
    };
    return outerTx
      ? exec(outerTx)
      : this.transactions.run(exec, { timeout: 15000 });
  }

  async list(
    organizationId: string,
    q: ListBundleComponentsQuery,
  ): Promise<BundleComponentRow[]> {
    return this.bundles.listBundleComponentsForTenant(organizationId, q);
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateBundleComponentDto,
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<BundleComponentRow> {
    const exec = async (
      tx: ProductsRepositoryTransaction,
    ): Promise<BundleComponentRow> => {
      const row = await this.bundles.findBundleComponentForTenant(tx, id, organizationId);
      if (!row) throw new NotFoundException('bundle-component not found');
      await this.bundles.lockBundleOptionRow(tx, row.bundleOptionId, organizationId);
      try {
        const count = await this.bundles.updateBundleComponentQty(tx, id, organizationId, dto.qty);
        if (count === 0) {
          throw new NotFoundException('bundle-component not found');
        }
        const updated = await this.bundles.findBundleComponentForTenant(tx, id, organizationId);
        if (!updated) {
          throw new NotFoundException('bundle-component not found');
        }
        await this.bundleStock.recompute(organizationId, row.bundleOptionId, tx);
        return updated;
      } catch (e) {
        mapPrismaError(e, 'bundle-component update');
      }
    };
    return outerTx
      ? exec(outerTx)
      : this.transactions.run(exec, { timeout: 15000 });
  }

  async delete(
    organizationId: string,
    id: string,
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<void> {
    const exec = async (tx: ProductsRepositoryTransaction): Promise<void> => {
      const row = await this.bundles.findBundleComponentForTenant(tx, id, organizationId);
      if (!row) throw new NotFoundException('bundle-component not found');
      await this.bundles.lockBundleOptionRow(tx, row.bundleOptionId, organizationId);
      try {
        const count = await this.bundles.deleteBundleComponentScoped(tx, id, organizationId);
        if (count === 0) {
          throw new NotFoundException('bundle-component not found');
        }
      } catch (e) {
        mapPrismaError(e, 'bundle-component delete');
      }
      await this.bundleStock.recompute(organizationId, row.bundleOptionId, tx);
    };
    await (outerTx
      ? exec(outerTx)
      : this.transactions.run(exec, { timeout: 15000 }));
  }
}
