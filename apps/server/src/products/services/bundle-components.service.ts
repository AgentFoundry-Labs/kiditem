// apps/server/src/products/services/bundle-components.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { BundleComponent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BundleStockService } from './bundle-stock.service';
import { CreateBundleComponentDto } from '../dto/create-bundle-component.dto';
import { UpdateBundleComponentDto } from '../dto/update-bundle-component.dto';
import { ListBundleComponentsQuery } from '../dto/list-bundle-components.query';
import { mapPrismaError } from '../util/prisma-error';
import {
  ensureBundleAndComponentInvariants,
  ensureNotSelfReference,
} from '../domain/bundle-component-rules';
import {
  createBundleComponent,
  deleteBundleComponentScoped,
  findBundleComponentForTenant,
  lockBundleOptionRow,
  updateBundleComponentQty,
} from '../persistence/bundle-component.persistence';
import { listBundleComponentsForTenant } from '../read-models/bundle-component-read-model';

/**
 * Bundle composition CRUD orchestration.
 *
 * Ownership / isolation invariants (products/CLAUDE.md) are enforced by the
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
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  async create(
    companyId: string,
    dto: CreateBundleComponentDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<BundleComponent> {
    ensureNotSelfReference(dto.bundleOptionId, dto.componentOptionId);

    const db = outerTx ?? this.prisma;
    const [bundleOpt, compOpt] = await Promise.all([
      db.productOption.findFirst({
        where: { id: dto.bundleOptionId, companyId, isDeleted: false },
      }),
      db.productOption.findFirst({
        where: { id: dto.componentOptionId, companyId, isDeleted: false },
      }),
    ]);
    ensureBundleAndComponentInvariants(bundleOpt, compOpt, companyId);

    const exec = async (
      tx: Prisma.TransactionClient,
    ): Promise<BundleComponent> => {
      await lockBundleOptionRow(tx, dto.bundleOptionId, companyId);
      try {
        const bc = await createBundleComponent(tx, {
          bundleOptionId: dto.bundleOptionId,
          componentOptionId: dto.componentOptionId,
          qty: dto.qty,
          // 3-way invariant: derive from bundle, not auth companyId.
          companyId: bundleOpt.companyId,
        });
        await this.bundleStock.recompute(companyId, dto.bundleOptionId, tx);
        return bc;
      } catch (e) {
        // mapPrismaError returns `never` — TS narrows the try-block happy path.
        mapPrismaError(e, 'bundle-component create');
      }
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  async list(
    companyId: string,
    q: ListBundleComponentsQuery,
  ): Promise<BundleComponent[]> {
    return listBundleComponentsForTenant(this.prisma, companyId, q);
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateBundleComponentDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<BundleComponent> {
    const exec = async (
      tx: Prisma.TransactionClient,
    ): Promise<BundleComponent> => {
      const row = await findBundleComponentForTenant(tx, id, companyId);
      if (!row) throw new NotFoundException('bundle-component not found');
      await lockBundleOptionRow(tx, row.bundleOptionId, companyId);
      try {
        const count = await updateBundleComponentQty(tx, id, companyId, dto.qty);
        if (count === 0) {
          throw new NotFoundException('bundle-component not found');
        }
        const updated = await findBundleComponentForTenant(tx, id, companyId);
        if (!updated) {
          throw new NotFoundException('bundle-component not found');
        }
        await this.bundleStock.recompute(companyId, row.bundleOptionId, tx);
        return updated;
      } catch (e) {
        mapPrismaError(e, 'bundle-component update');
      }
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  async delete(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const exec = async (tx: Prisma.TransactionClient): Promise<void> => {
      const row = await findBundleComponentForTenant(tx, id, companyId);
      if (!row) throw new NotFoundException('bundle-component not found');
      await lockBundleOptionRow(tx, row.bundleOptionId, companyId);
      try {
        const count = await deleteBundleComponentScoped(tx, id, companyId);
        if (count === 0) {
          throw new NotFoundException('bundle-component not found');
        }
      } catch (e) {
        mapPrismaError(e, 'bundle-component delete');
      }
      await this.bundleStock.recompute(companyId, row.bundleOptionId, tx);
    };
    await (outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 }));
  }
}
