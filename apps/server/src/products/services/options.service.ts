// apps/server/src/products/services/options.service.ts
import {
  ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductOption } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BundleStockService } from './bundle-stock.service';
import { CreateOptionDto } from '../dto/create-option.dto';
import { UpdateOptionDto } from '../dto/update-option.dto';
import { ListOptionsQuery } from '../dto/list-options.query';
import { mapPrismaError } from '../util/prisma-error';
import { decodeCursor, encodeCursor } from '../util/cursor';

// System-managed fields clients cannot set/change via DTO.
// `masterId` is included → prevents IDOR re-parent via PATCH.
const SYSTEM_FIELDS = [
  'id', 'sku', 'companyId', 'masterId', 'availableStock',
  'isDeleted', 'deletedAt', 'createdAt', 'updatedAt',
] as const;

@Injectable()
export class OptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  /**
   * Create a ProductOption under a master with race-free sku generation.
   *
   * Transaction body:
   *   1. `updateMany` MasterProduct with filter `{id, companyId, isDeleted:false}` —
   *      combines TOCTOU guard + atomic counter increment in a single row lock.
   *   2. Re-read master.{code, optionCounter} via `findUniqueOrThrow` (post-increment).
   *   3. Compose sku = `${code}-${String(counter).padStart(2,'0')}`.
   *   4. Create ProductOption with `availableStock: null` (bundle stock is derived).
   *
   * Gaps are allowed (counter increments even on downstream failure); Plan B1 spec
   * explicitly accepts gap-tolerant numbering.
   *
   * @param outerTx - Optional outer transaction (Plan B2 sourcing/supplier-sync compose).
   *                  Caller must pass `{ timeout: >= 15000 }` on the outer `$transaction`
   *                  so cold-cache writes don't trip Prisma's 5 s default.
   */
  async create(
    companyId: string,
    dto: CreateOptionDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<ProductOption> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.masterProduct.updateMany({
        where: { id: dto.masterId, companyId, isDeleted: false },
        data: { optionCounter: { increment: 1 } },
      });
      if (count === 0) throw new NotFoundException('master not found or deleted');
      const master = await tx.masterProduct.findUniqueOrThrow({
        where: { id: dto.masterId },
        select: { code: true, optionCounter: true },
      });
      const sku = `${master.code}-${String(master.optionCounter).padStart(2, '0')}`;
      const stripped = this.strip(dto);
      try {
        return await tx.productOption.create({
          data: {
            ...stripped,
            companyId,
            masterId: dto.masterId,
            sku,
            availableStock: null,
          } as Prisma.ProductOptionUncheckedCreateInput,
        });
      } catch (e) { mapPrismaError(e, 'option create'); }
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  /**
   * Cursor-paginated list.
   *
   * search + cursor are wrapped in an `AND` array to avoid OR-collision
   * between them (same fix applied in MastersService Task 3).
   */
  async list(companyId: string, q: ListOptionsQuery) {
    const limit = q.limit ?? 50;

    const ands: Prisma.ProductOptionWhereInput[] = [];
    if (q.search) {
      ands.push({
        OR: [
          { sku: { contains: q.search, mode: 'insensitive' } },
          { legacyCode: { contains: q.search } },
          { optionName: { contains: q.search, mode: 'insensitive' } },
        ],
      });
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      ands.push({
        OR: [
          { createdAt: { lt: new Date(c.createdAt) } },
          { createdAt: new Date(c.createdAt), id: { lt: c.id } },
        ],
      });
    }

    const where: Prisma.ProductOptionWhereInput = {
      companyId,
      ...(q.includeDeleted ? {} : { isDeleted: false }),
      ...(q.masterId ? { masterId: q.masterId } : {}),
      ...(q.isBundle !== undefined ? { isBundle: q.isBundle } : {}),
      ...(q.isDeleted !== undefined ? { isDeleted: q.isDeleted } : {}),
      ...(q.isTemporary !== undefined ? { isTemporary: q.isTemporary } : {}),
      ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
      ...(ands.length > 0 ? { AND: ands } : {}),
    };

    const rows = await this.prisma.productOption.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit
      ? encodeCursor({
          createdAt: items[items.length - 1].createdAt.toISOString(),
          id: items[items.length - 1].id,
        })
      : null;
    return { items, nextCursor };
  }

  async findById(
    companyId: string, id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<ProductOption> {
    const row = await this.prisma.productOption.findFirst({
      where: { id, companyId, ...(opts.includeDeleted ? {} : { isDeleted: false }) },
    });
    if (!row) throw new NotFoundException('option not found');
    return row;
  }

  /**
   * sku is globally unique (no partial index), but a soft-deleted row could
   * still own a sku. Filter `isDeleted:false` explicitly + cross-tenant check.
   */
  async findBySku(companyId: string, sku: string): Promise<ProductOption> {
    const row = await this.prisma.productOption.findUnique({ where: { sku } });
    if (!row || row.companyId !== companyId || row.isDeleted) {
      throw new NotFoundException('option not found');
    }
    return row;
  }

  /**
   * Barcode uniqueness is enforced by partial index
   * (`product_options_company_barcode_active`) — only active rows are unique.
   * Use `findFirst` (NOT `findUnique`) so we stay aligned with the partial-index
   * semantics (soft-deleted rows must not be returned, and the compound PG
   * unique constraint was dropped in pre-T4 migration).
   */
  async findByBarcode(companyId: string, barcode: string): Promise<ProductOption> {
    const row = await this.prisma.productOption.findFirst({
      where: { companyId, barcode, isDeleted: false },
    });
    if (!row) throw new NotFoundException('option not found');
    return row;
  }

  /**
   * PATCH — updates non-system fields only (SYSTEM_FIELDS stripped).
   *
   * isBundle flip rules (409):
   *   - true → false: reject if this option owns BundleComponent rows
   *     (i.e. is referenced as `bundleOptionId`).
   *   - false → true: reject if this option is already referenced as
   *     a component elsewhere (i.e. `componentOptionId`).
   *
   * `isTemporary=false` clears `temporaryReason` automatically.
   *
   * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
   *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateOptionDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<ProductOption> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const current = await tx.productOption.findFirst({
        where: { id, companyId, isDeleted: false },
      });
      if (!current) throw new NotFoundException('option not found');

      if (dto.isBundle !== undefined && dto.isBundle !== current.isBundle) {
        if (dto.isBundle === false) {
          const count = await tx.bundleComponent.count({
            where: { bundleOptionId: id },
          });
          if (count > 0) {
            throw new ConflictException('bundle has components; cannot set isBundle=false');
          }
        } else {
          const count = await tx.bundleComponent.count({
            where: { componentOptionId: id },
          });
          if (count > 0) {
            throw new ConflictException('option is used as component; cannot set isBundle=true');
          }
        }
      }

      const stripped = this.strip(dto);
      const data: Prisma.ProductOptionUncheckedUpdateInput = { ...stripped };
      if (dto.isTemporary === false) data.temporaryReason = null;
      try {
        const { count } = await tx.productOption.updateMany({
          where: { id, companyId, isDeleted: false },
          data,
        });
        if (count === 0) throw new NotFoundException('option not found');
        return await tx.productOption.findUniqueOrThrow({ where: { id } });
      } catch (e) { mapPrismaError(e, 'option update'); }
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  /**
   * Soft-delete cascade: when a component option is soft-deleted, every bundle
   * that references it must recompute its availableStock (treating the deleted
   * component as unavailable via `componentOption.isDeleted:false` filter).
   *
   * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
   *                  `{ timeout: >= 15000 }` on the outer `$transaction` — recompute
   *                  fan-out across many bundles can exceed the default 5 s.
   */
  async softDelete(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.productOption.updateMany({
        where: { id, companyId, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('option not found');
      const affected = await tx.bundleComponent.findMany({
        where: { componentOptionId: id },
        select: { bundleOptionId: true },
      });
      for (const row of affected) {
        await this.bundleStock.recompute(row.bundleOptionId, tx);
      }
    };
    await (outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 }));
  }

  /**
   * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
   *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
   */
  async restore(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = outerTx ?? this.prisma;
    const row = await db.productOption.findFirst({
      where: { id, companyId, isDeleted: true },
    });
    if (!row) throw new NotFoundException('option not found or not deleted');
    try {
      await db.productOption.update({
        where: { id },
        data: { isDeleted: false, deletedAt: null },
      });
    } catch (e) { mapPrismaError(e, 'option restore'); }
  }

  /**
   * Remove SYSTEM_FIELDS from a DTO before forwarding to Prisma. The return
   * type preserves the caller's input type minus the stripped keys so call
   * sites don't need a loose `Record<string, unknown>` intermediate cast
   * (apps/server/CLAUDE.md:60 forbids that pattern). The remaining cast to
   * `Prisma.ProductOptionUnchecked{Create,Update}Input` at the call site is
   * inherent to the DTO↔Prisma-input shape gap and unavoidable.
   */
  private strip<T extends Partial<CreateOptionDto> | Partial<UpdateOptionDto>>(
    dto: T,
  ): Omit<T, typeof SYSTEM_FIELDS[number]> {
    const out: Record<string, unknown> = { ...dto };
    for (const f of SYSTEM_FIELDS) delete out[f as string];
    return out as Omit<T, typeof SYSTEM_FIELDS[number]>;
  }
}
