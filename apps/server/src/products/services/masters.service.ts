// apps/server/src/products/services/masters.service.ts
import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { MasterProduct, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MasterCodeService } from './master-code.service';
import { CreateMasterDto } from '../dto/create-master.dto';
import { UpdateMasterDto } from '../dto/update-master.dto';
import { ListMastersQuery } from '../dto/list-masters.query';
import { mapPrismaError } from '../util/prisma-error';
import { decodeCursor, encodeCursor } from '../util/cursor';

const SYSTEM_FIELDS = [
  'id', 'code', 'companyId', 'optionCounter', 'isDeleted', 'deletedAt',
  'healthUpdatedAt', 'rawData', 'processedData', 'draftContent',
  'createdAt', 'updatedAt',
] as const;

@Injectable()
export class MastersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSvc: MasterCodeService,
  ) {}

  /**
   * @param outerTx - Optional outer transaction (Plan B2 sourcing/supplier-sync compose).
   *                  Caller must pass `{ timeout: >= 15000 }` on the outer `$transaction`
   *                  so cold-cache writes don't trip Prisma's 5 s default.
   */
  async create(
    companyId: string,
    dto: CreateMasterDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<MasterProduct> {
    const db = outerTx ?? this.prisma;
    if (dto.supplierId) {
      const supplier = await db.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { companyId: true },
      });
      if (!supplier) throw new NotFoundException('supplier not found');
      if (supplier.companyId !== companyId) {
        throw new ForbiddenException('supplier belongs to another company');
      }
    }
    const code = await this.codeSvc.generate();
    const stripped = this.strip(dto);
    try {
      return await db.masterProduct.create({
        data: {
          ...stripped,
          companyId,
          code,
          healthUpdatedAt: dto.healthScore !== undefined ? new Date() : null,
        } as Prisma.MasterProductUncheckedCreateInput,
      });
    } catch (e) { mapPrismaError(e, 'master create'); }
  }

  async list(companyId: string, q: ListMastersQuery) {
    const limit = q.limit ?? 50;

    const ands: Prisma.MasterProductWhereInput[] = [];
    if (q.search) {
      ands.push({
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { legacyCode: { contains: q.search } },
          { code: { contains: q.search } },
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

    const where: Prisma.MasterProductWhereInput = {
      companyId,
      ...(q.includeDeleted ? {} : { isDeleted: false }),
      ...(q.isDeleted !== undefined ? { isDeleted: q.isDeleted } : {}),
      ...(q.isTemporary !== undefined ? { isTemporary: q.isTemporary } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.brand ? { brand: q.brand } : {}),
      ...(q.abcGrade ? { abcGrade: q.abcGrade } : {}),
      ...(q.pipelineStep ? { pipelineStep: q.pipelineStep } : {}),
      ...(ands.length > 0 ? { AND: ands } : {}),
    };

    const rows = await this.prisma.masterProduct.findMany({
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
    companyId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findFirst({
      where: {
        id, companyId,
        ...(opts.includeDeleted ? {} : { isDeleted: false }),
      },
    });
    if (!row) throw new NotFoundException('master not found');
    return row;
  }

  async findByCode(companyId: string, code: string): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { code, companyId, isDeleted: false },
    });
    if (!row) throw new NotFoundException('master not found');
    return row;
  }

  async findByLegacy(companyId: string, legacyCode: string): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { companyId, legacyCode, isDeleted: false },
    });
    if (!row) throw new NotFoundException('master not found');
    return row;
  }

  /**
   * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
   *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateMasterDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<MasterProduct> {
    const db = outerTx ?? this.prisma;
    if (dto.supplierId !== undefined && dto.supplierId !== null) {
      const supplier = await db.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { companyId: true },
      });
      if (!supplier || supplier.companyId !== companyId) {
        throw new ForbiddenException('supplier not in same company');
      }
    }
    const stripped = this.strip(dto);
    const data: Prisma.MasterProductUncheckedUpdateInput = { ...stripped };
    if (dto.healthScore !== undefined) data.healthUpdatedAt = new Date();
    if (dto.isTemporary === false) data.temporaryReason = null;
    try {
      const { count } = await db.masterProduct.updateMany({
        where: { id, companyId, isDeleted: false },
        data,
      });
      if (count === 0) throw new NotFoundException('master not found or deleted');
      return await db.masterProduct.findUniqueOrThrow({ where: { id } });
    } catch (e) { mapPrismaError(e, 'master update'); }
  }

  /**
   * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
   *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
   */
  async softDelete(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = outerTx ?? this.prisma;
    const { count } = await db.masterProduct.updateMany({
      where: { id, companyId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('master not found');
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
    const row = await db.masterProduct.findFirst({
      where: { id, companyId, isDeleted: true },
    });
    if (!row) throw new NotFoundException('master not found or not deleted');
    try {
      await db.masterProduct.update({
        where: { id },
        data: { isDeleted: false, deletedAt: null },
      });
    } catch (e) { mapPrismaError(e, 'master restore'); }
  }

  /**
   * Remove SYSTEM_FIELDS from a DTO before forwarding to Prisma. The return
   * type preserves the caller's input type minus the stripped keys so call
   * sites don't need a loose `Record<string, unknown>` intermediate cast
   * (apps/server/CLAUDE.md:60 forbids that pattern). The remaining cast to
   * `Prisma.MasterProductUnchecked{Create,Update}Input` at the call site is
   * inherent to the DTO↔Prisma-input shape gap and unavoidable.
   */
  private strip<T extends Partial<CreateMasterDto> | Partial<UpdateMasterDto>>(
    dto: T,
  ): Omit<T, typeof SYSTEM_FIELDS[number]> {
    const out: Record<string, unknown> = { ...dto };
    for (const f of SYSTEM_FIELDS) delete out[f as string];
    return out as Omit<T, typeof SYSTEM_FIELDS[number]>;
  }
}
