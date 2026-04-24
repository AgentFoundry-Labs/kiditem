// apps/server/src/products/services/masters.service.ts
import { randomUUID } from 'node:crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { MasterProduct, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { MulterFile } from '../../common/types';
import { MasterCodeService } from './master-code.service';
import { CreateMasterDto } from '../dto/create-master.dto';
import { UpdateMasterDto } from '../dto/update-master.dto';
import { ListMastersQuery } from '../dto/list-masters.query';
import { mapPrismaError } from '../util/prisma-error';
import { decodeCursor, encodeCursor } from '../util/cursor';
import { normalizeMasterImages, withNormalizedMasterImages } from './product-image-normalizer';

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
    private readonly storage: StorageService,
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
      const row = await db.masterProduct.create({
        data: {
          ...stripped,
          companyId,
          code,
          healthUpdatedAt: dto.healthScore !== undefined ? new Date() : null,
        } as Prisma.MasterProductUncheckedCreateInput,
      });
      return withNormalizedMasterImages(row) as MasterProduct;
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
    const items = rows.slice(0, limit).map((r) => withNormalizedMasterImages(r) as MasterProduct);
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
    return withNormalizedMasterImages(row) as MasterProduct;
  }

  async findByCode(companyId: string, code: string): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { code, companyId, isDeleted: false },
    });
    if (!row) throw new NotFoundException('master not found');
    return withNormalizedMasterImages(row) as MasterProduct;
  }

  async findByLegacy(companyId: string, legacyCode: string): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { companyId, legacyCode, isDeleted: false },
    });
    if (!row) throw new NotFoundException('master not found');
    return withNormalizedMasterImages(row) as MasterProduct;
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
    const data = { ...stripped } as Prisma.MasterProductUncheckedUpdateInput;
    if (dto.healthScore !== undefined) data.healthUpdatedAt = new Date();
    if (dto.isTemporary === false) data.temporaryReason = null;
    try {
      const { count } = await db.masterProduct.updateMany({
        where: { id, companyId, isDeleted: false },
        data,
      });
      if (count === 0) throw new NotFoundException('master not found or deleted');
      const row = await db.masterProduct.findUniqueOrThrow({ where: { id } });
      return withNormalizedMasterImages(row) as MasterProduct;
    } catch (e) { mapPrismaError(e, 'master update'); }
  }

  async updateImages(
    companyId: string,
    id: string,
    images: unknown,
  ): Promise<MasterProduct> {
    const normalized = normalizeMasterImages(images);
    const { count } = await this.prisma.masterProduct.updateMany({
      where: { id, companyId, isDeleted: false },
      data: { images: normalized as Prisma.InputJsonValue },
    });
    if (count === 0) throw new NotFoundException('master not found or deleted');
    const row = await this.prisma.masterProduct.findUniqueOrThrow({ where: { id } });
    return withNormalizedMasterImages(row) as MasterProduct;
  }

  async uploadImage(
    companyId: string,
    id: string,
    file: MulterFile,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('file is required');
    await this.findById(companyId, id, {});
    const ext = file.mimetype === 'image/png'
      ? 'png'
      : file.mimetype === 'image/webp'
        ? 'webp'
        : 'jpg';
    const key = `product-images/${id}/${randomUUID()}.${ext}`;
    const url = await this.storage.save(key, file.buffer, file.mimetype);
    return { url };
  }

  async originalImageBase64(
    companyId: string,
    id: string,
  ): Promise<{ dataUrl: string }> {
    const row = await this.findById(companyId, id, {});
    const images = normalizeMasterImages((row as unknown as { images: unknown }).images);
    const url = row.imageUrl ?? row.thumbnailUrl ?? images[0]?.url ?? null;
    if (!url) throw new NotFoundException('image not found');
    // Minimum SSRF defense: only http(s), block internal hosts. Full domain allowlist
    // is a follow-up (see TODOS.md "originalImageBase64 SSRF allowlist").
    this.assertPublicHttpUrl(url);
    const res = await fetch(url);
    if (!res.ok) throw new NotFoundException('image not found');
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { dataUrl: `data:${contentType};base64,${buffer.toString('base64')}` };
  }

  private assertPublicHttpUrl(raw: string): void {
    let parsed: URL;
    try { parsed = new URL(raw); } catch { throw new BadRequestException('invalid image url'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('image url protocol must be http(s)');
    }
    const host = parsed.hostname.toLowerCase();
    // Block loopback / unspecified / known private ranges / metadata endpoints.
    const blocked =
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '::' ||
      host === '169.254.169.254' || // cloud metadata
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^fc[0-9a-f]{2}:/i.test(host) ||
      /^fe80:/i.test(host);
    if (blocked) throw new BadRequestException('image url host not allowed');
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
