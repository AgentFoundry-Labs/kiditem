// apps/server/src/products/services/bundle-components.service.ts
import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { BundleComponent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BundleStockService } from './bundle-stock.service';
import { CreateBundleComponentDto } from '../dto/create-bundle-component.dto';
import { UpdateBundleComponentDto } from '../dto/update-bundle-component.dto';
import { ListBundleComponentsQuery } from '../dto/list-bundle-components.query';
import { mapPrismaError } from '../util/prisma-error';

/**
 * Bundle composition CRUD.
 *
 * Ownership / isolation invariants (products/CLAUDE.md):
 *   - `BundleComponent.companyId` is **derived from `bundleOption.companyId`**,
 *     not the auth caller's companyId (3-way invariant). Callers still need to
 *     pass `@CurrentCompany()` so we can reject cross-tenant bundle access.
 *   - Self-reference (`bundleOptionId === componentOptionId`) is rejected 409.
 *   - Nested bundles (component.isBundle=true) are rejected 400 (Plan B1 scope).
 *   - Soft-deleted `bundleOption` or `componentOption` → 404 (T3 spec-reviewer
 *     feedback — we must not attach to tombstones that `OptionsService` already
 *     excludes from default reads).
 *
 * Transaction composition:
 *   Each mutating method accepts an optional `outerTx?` so Plan B2 sourcing /
 *   supplier sync flows can wrap CRUD + other writes in a single transaction.
 *   Inside, we acquire a row lock on `product_options` (the bundle row) so
 *   concurrent recompute stays deterministic.
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
    if (dto.bundleOptionId === dto.componentOptionId) {
      throw new ConflictException('self-reference');
    }
    const db = outerTx ?? this.prisma;
    const [bundleOpt, compOpt] = await Promise.all([
      db.productOption.findUnique({ where: { id: dto.bundleOptionId } }),
      db.productOption.findUnique({ where: { id: dto.componentOptionId } }),
    ]);
    // Soft-deleted rows are tombstones — treat as not-found to match
    // OptionsService.findById default semantics (T3 spec-reviewer feedback).
    if (!bundleOpt || bundleOpt.isDeleted) {
      throw new NotFoundException('bundle option not found');
    }
    if (!compOpt || compOpt.isDeleted) {
      throw new NotFoundException('component option not found');
    }
    if (!bundleOpt.isBundle) {
      throw new BadRequestException('option is not a bundle');
    }
    if (compOpt.isBundle) {
      throw new BadRequestException('nested bundle not supported in Plan B1');
    }
    if (bundleOpt.companyId !== companyId) {
      throw new ForbiddenException('cross-company not allowed');
    }
    if (compOpt.companyId !== bundleOpt.companyId) {
      throw new ForbiddenException('cross-company not allowed');
    }

    const exec = async (tx: Prisma.TransactionClient) => {
      // Row-level lock on the bundle option: serializes concurrent recompute
      // + create/update/delete on the same bundle.
      await tx.$queryRaw`SELECT id FROM product_options WHERE id = ${dto.bundleOptionId}::uuid FOR UPDATE`;
      let bc: BundleComponent;
      try {
        bc = await tx.bundleComponent.create({
          data: {
            bundleOptionId: dto.bundleOptionId,
            componentOptionId: dto.componentOptionId,
            qty: dto.qty,
            // 3-way invariant: derive from bundle, not auth companyId.
            companyId: bundleOpt.companyId,
          },
        });
      } catch (e) { mapPrismaError(e, 'bundle-component create'); }
      await this.bundleStock.recompute(dto.bundleOptionId, tx);
      return bc!;
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  /**
   * Forward (by bundle) or reverse (by component) listing.
   * At least one filter is required so the result set is bounded.
   */
  async list(
    companyId: string,
    q: ListBundleComponentsQuery,
  ): Promise<BundleComponent[]> {
    if (!q.bundleOptionId && !q.componentOptionId) {
      throw new BadRequestException('bundleOptionId or componentOptionId is required');
    }
    return this.prisma.bundleComponent.findMany({
      where: {
        companyId,
        ...(q.bundleOptionId ? { bundleOptionId: q.bundleOptionId } : {}),
        ...(q.componentOptionId ? { componentOptionId: q.componentOptionId } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateBundleComponentDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<BundleComponent> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const row = await tx.bundleComponent.findFirst({ where: { id, companyId } });
      if (!row) throw new NotFoundException('bundle-component not found');
      await tx.$queryRaw`SELECT id FROM product_options WHERE id = ${row.bundleOptionId}::uuid FOR UPDATE`;
      let updated: BundleComponent;
      try {
        updated = await tx.bundleComponent.update({
          where: { id },
          data: { qty: dto.qty },
        });
      } catch (e) { mapPrismaError(e, 'bundle-component update'); }
      await this.bundleStock.recompute(row.bundleOptionId, tx);
      return updated!;
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
    const exec = async (tx: Prisma.TransactionClient) => {
      const row = await tx.bundleComponent.findFirst({ where: { id, companyId } });
      if (!row) throw new NotFoundException('bundle-component not found');
      await tx.$queryRaw`SELECT id FROM product_options WHERE id = ${row.bundleOptionId}::uuid FOR UPDATE`;
      try {
        await tx.bundleComponent.delete({ where: { id } });
      } catch (e) { mapPrismaError(e, 'bundle-component delete'); }
      await this.bundleStock.recompute(row.bundleOptionId, tx);
    };
    await (outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 }));
  }
}
