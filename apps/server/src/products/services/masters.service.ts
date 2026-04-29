// apps/server/src/products/services/masters.service.ts
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { MasterProduct, MasterProductImage, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { MulterFile } from '../../common/types';
import type { MasterImageItem } from '@kiditem/shared/product';
import { MasterCodeService } from './master-code.service';
import { CreateMasterDto } from '../dto/create-master.dto';
import { UpdateMasterDto } from '../dto/update-master.dto';
import { ListMastersQuery } from '../dto/list-masters.query';
import { mapPrismaError } from '../util/prisma-error';
import { decodeCursor, encodeCursor } from '../util/cursor';
import { normalizeMasterImages } from './product-image-normalizer';

const SYSTEM_FIELDS = [
  'id', 'code', 'companyId', 'optionCounter', 'isDeleted', 'deletedAt',
  'healthUpdatedAt', 'rawData', 'processedData', 'draftContent',
  'createdAt', 'updatedAt', 'images', 'imageUrl',
] as const;

const MASTER_WITH_IMAGES: Prisma.MasterProductInclude = {
  images: {
    where: { isDeleted: false },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
};

type MasterWithImageRows = MasterProduct & { images: MasterProductImage[] };

function toMasterImageItem(row: MasterProductImage): MasterImageItem {
  return {
    id: row.id,
    url: row.url,
    storageKey: row.storageKey,
    role: row.role as MasterImageItem['role'],
    label: row.label,
    sortOrder: row.sortOrder,
    source: row.source,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    fileSize: row.fileSize,
    isPrimary: row.isPrimary,
  };
}

function withImageRows(row: MasterWithImageRows): MasterProduct {
  return { ...row, images: row.images.map(toMasterImageItem) } as unknown as MasterProduct;
}

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
      const supplier = await db.supplier.findFirst({
        where: { id: dto.supplierId, companyId },
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException('supplier not found');
    }
    const code = await this.codeSvc.generate();
    const stripped = this.strip(dto);
    try {
      const normalizedImages = this.normalizeImagesForWrite(
        dto.images ?? (dto.imageUrl ? [{ url: dto.imageUrl, role: 'product', label: null, sortOrder: 0 }] : []),
      );
      const createInTx = async (tx: Prisma.TransactionClient) => {
        const row = await tx.masterProduct.create({
          data: {
            ...stripped,
            companyId,
            code,
            imageUrl: this.representativeImageUrl(normalizedImages),
            healthUpdatedAt: dto.healthScore !== undefined ? new Date() : null,
          } as Prisma.MasterProductUncheckedCreateInput,
        });
        await this.createImageRowsTx(tx, companyId, row.id, normalizedImages);
        const created = await tx.masterProduct.findFirst({
          where: { id: row.id, companyId },
          include: MASTER_WITH_IMAGES,
        });
        if (!created) throw new NotFoundException('master not found');
        return created;
      };
      const row = outerTx ? await createInTx(outerTx) : await this.prisma.$transaction(createInTx);
      return withImageRows(row);
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
          // ADR-0022 — search by source barcode/EAN. May return multiple masters
          // because (companyId, barcode) is non-unique by design.
          { barcode: { contains: q.search } },
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
      include: MASTER_WITH_IMAGES,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map((r) => withImageRows(r));
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
      include: MASTER_WITH_IMAGES,
    });
    if (!row) throw new NotFoundException('master not found');
    return withImageRows(row);
  }

  async findByCode(companyId: string, code: string): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { code, companyId, isDeleted: false },
      include: MASTER_WITH_IMAGES,
    });
    if (!row) throw new NotFoundException('master not found');
    return withImageRows(row);
  }

  async findByLegacy(companyId: string, legacyCode: string): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { companyId, legacyCode, isDeleted: false },
      include: MASTER_WITH_IMAGES,
    });
    if (!row) throw new NotFoundException('master not found');
    return withImageRows(row);
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
      const supplier = await db.supplier.findFirst({
        where: { id: dto.supplierId, companyId },
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException('supplier not found');
    }
    const stripped = this.strip(dto);
    const data = { ...stripped } as Prisma.MasterProductUncheckedUpdateInput;
    if (dto.healthScore !== undefined) data.healthUpdatedAt = new Date();
    if (dto.isTemporary === false) data.temporaryReason = null;
    try {
      const updateInTx = async (tx: Prisma.TransactionClient) => {
        const { count } = await tx.masterProduct.updateMany({
          where: { id, companyId, isDeleted: false },
          data,
        });
        if (count === 0) throw new NotFoundException('master not found or deleted');
        if (dto.images !== undefined || dto.imageUrl !== undefined) {
          await this.replaceImagesTx(
            tx,
            companyId,
            id,
            dto.images ?? (dto.imageUrl ? [{ url: dto.imageUrl, role: 'product', label: null, sortOrder: 0 }] : []),
          );
        }
        const updated = await tx.masterProduct.findFirst({
          where: { id, companyId, isDeleted: false },
          include: MASTER_WITH_IMAGES,
        });
        if (!updated) throw new NotFoundException('master not found or deleted');
        return updated;
      };
      const row = outerTx ? await updateInTx(outerTx) : await this.prisma.$transaction(updateInTx);
      return withImageRows(row);
    } catch (e) { mapPrismaError(e, 'master update'); }
  }

  /**
   * Read the normalized image list for a master. Wraps `findById` +
   * `normalizeMasterImages` so controllers can emit `{ images }` envelopes
   * without duplicating the read-path lenience logic.
   */
  async getImages(
    companyId: string,
    id: string,
  ): Promise<MasterImageItem[]> {
    const rows = await this.prisma.masterProductImage.findMany({
      where: { companyId, masterId: id, isDeleted: false },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (rows.length === 0) await this.findById(companyId, id, {});
    return rows.map(toMasterImageItem);
  }

  async updateImages(
    companyId: string,
    id: string,
    images: unknown,
  ): Promise<MasterProduct> {
    const row = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.masterProduct.updateMany({
        where: { id, companyId, isDeleted: false },
        data: { imageUrl: this.representativeImageUrl(this.normalizeImagesForWrite(images)) },
      });
      if (count === 0) throw new NotFoundException('master not found or deleted');
      await this.replaceImagesTx(tx, companyId, id, images);
      const updated = await tx.masterProduct.findFirst({
        where: { id, companyId, isDeleted: false },
        include: MASTER_WITH_IMAGES,
      });
      if (!updated) throw new NotFoundException('master not found or deleted');
      return updated;
    });
    return withImageRows(row);
  }

  /**
   * Persist `file` to object storage under the master-scoped prefix and
   * persist a MasterProductImage metadata row. The binary lives in object
   * storage; DB stores URL/key metadata only. If this is the first image,
   * MasterProduct.imageUrl is updated in the same transaction as the cache.
   */
  async uploadImage(
    companyId: string,
    id: string,
    file: MulterFile,
  ): Promise<MasterImageItem> {
    if (!file) throw new BadRequestException('file is required');
    // Defense in depth: even though MastersController's FileInterceptor
    // rejects non-image MIMEs, the service re-checks against a canonical
    // mime→ext map so we never trust `file.mimetype` blindly to derive the
    // storage key extension (external review HIGH).
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = mimeToExt[file.mimetype];
    if (!ext) {
      throw new BadRequestException(`unsupported mime type: ${file.mimetype}`);
    }
    await this.findById(companyId, id, {});
    const key = `product-images/${id}/${randomUUID()}.${ext}`;
    const url = await this.storage.save(key, file.buffer, file.mimetype);
    const row = await this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.masterProductImage.count({
        where: { companyId, masterId: id, isDeleted: false },
      });
      const image = await tx.masterProductImage.create({
        data: {
          companyId,
          masterId: id,
          url,
          storageKey: key,
          role: 'product',
          label: null,
          sortOrder: existingCount,
          source: 'upload',
          mimeType: file.mimetype,
          fileSize: file.size,
          isPrimary: existingCount === 0,
        },
      });
      if (existingCount === 0) {
        await tx.masterProduct.updateMany({
          where: { id, companyId, isDeleted: false },
          data: { imageUrl: url },
        });
      }
      return image;
    });
    return toMasterImageItem(row);
  }

  async originalImageBase64(
    companyId: string,
    id: string,
  ): Promise<{ dataUrl: string }> {
    const row = await this.findById(companyId, id, {});
    const images = normalizeMasterImages((row as unknown as { images: unknown }).images);
    const url = row.imageUrl ?? images[0]?.url ?? row.thumbnailUrl ?? null;
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
    // `new URL('http://[::1]/').hostname` returns `[::1]` with brackets; strip them
    // before IP classification. IPv6 zone-id (fe80::1%eth0) is also stripped.
    const rawHost = parsed.hostname.toLowerCase();
    let host = rawHost;
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    const zoneIdx = host.indexOf('%');
    if (zoneIdx !== -1) host = host.slice(0, zoneIdx);

    // Hostname blocklist (non-IP).
    if (host === 'localhost' || host === '') {
      throw new BadRequestException('image url host not allowed');
    }

    const ipKind = isIP(host);
    // Non-IP hostnames: accept here (full CDN allowlist is a follow-up — TODOS.md).
    // We cannot resolve DNS synchronously in this path without adding latency and
    // TOCTOU complexity; tracked for the allowlist slice.
    if (ipKind === 0) return;

    if (ipKind === 4) {
      if (this.isPrivateIPv4(host)) throw new BadRequestException('image url host not allowed');
      return;
    }

    if (ipKind === 6) {
      // RFC 4291 §2.5.5.2 IPv4-mapped (`::ffff:A.B.C.D`) and §2.5.5.1 IPv4-compatible
      // (deprecated `::A.B.C.D`) resolve to an embedded IPv4. WHATWG URL normalizes
      // both to 16-bit hex groups — e.g. `::ffff:127.0.0.1` → `::ffff:7f00:1`,
      // `::127.0.0.1` → `::7f00:1`. Decode the last 32 bits and apply IPv4 rules,
      // otherwise `::ffff:127.0.0.1` / `::ffff:169.254.169.254` etc. bypass the
      // loopback + metadata blocks.
      const embeddedV4 = this.extractEmbeddedIPv4(host);
      if (embeddedV4) {
        if (this.isPrivateIPv4(embeddedV4)) throw new BadRequestException('image url host not allowed');
        return;
      }

      // Canonical IPv6 forms for loopback / unspecified / link-local / ULA.
      const blocked6 =
        host === '::1' ||
        host === '::' ||
        /^fe[89ab][0-9a-f]?:/.test(host) || // fe80::/10 link-local (and fe8X:/fe9X:/feAX:/feBX:)
        /^fc[0-9a-f]{2}:/.test(host) ||     // fc00::/7 ULA
        /^fd[0-9a-f]{2}:/.test(host);       // fd00::/8 ULA
      if (blocked6) throw new BadRequestException('image url host not allowed');
      return;
    }
  }

  private extractEmbeddedIPv4(host: string): string | null {
    // Text forms (rare after URL normalization but keep for defense-in-depth).
    const mapText = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (mapText && isIP(mapText[1]) === 4) return mapText[1];
    const compatText = /^::(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (compatText && isIP(compatText[1]) === 4) return compatText[1];

    // Hex forms produced by WHATWG URL: `::ffff:HHHH:HHHH` / `::HHHH:HHHH`.
    const decodeHex = (hi: string, lo: string): string => {
      const h = parseInt(hi, 16);
      const l = parseInt(lo, 16);
      return `${(h >> 8) & 0xff}.${h & 0xff}.${(l >> 8) & 0xff}.${l & 0xff}`;
    };
    const mapHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (mapHex) return decodeHex(mapHex[1], mapHex[2]);
    // `::HHHH:HHHH` (IPv4-compat). Skip `::1` / `::` — handled by literal check.
    const compatHex = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (compatHex) return decodeHex(compatHex[1], compatHex[2]);

    return null;
  }

  private isPrivateIPv4(ip: string): boolean {
    return (
      /^127\./.test(ip) ||
      /^10\./.test(ip) ||
      /^192\.168\./.test(ip) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
      /^169\.254\./.test(ip) ||
      /^0\./.test(ip) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)
    );
  }

  private normalizeImagesForWrite(images: unknown): MasterImageItem[] {
    return normalizeMasterImages(images).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private representativeImageUrl(images: MasterImageItem[]): string | null {
    return images.find((img) => img.isPrimary)?.url ?? images[0]?.url ?? null;
  }

  private primaryImageIndex(images: MasterImageItem[]): number {
    if (images.length === 0) return -1;
    const explicit = images.findIndex((img) => img.isPrimary === true);
    return explicit >= 0 ? explicit : 0;
  }

  private async createImageRowsTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    masterId: string,
    images: MasterImageItem[],
  ): Promise<void> {
    if (images.length === 0) return;
    const primaryIndex = this.primaryImageIndex(images);
    await tx.masterProductImage.createMany({
      data: images.map((img, index) => ({
        companyId,
        masterId,
        url: img.url,
        storageKey: img.storageKey ?? null,
        role: img.role,
        label: img.label,
        sortOrder: img.sortOrder,
        source: img.source ?? 'api',
        mimeType: img.mimeType ?? null,
        width: img.width ?? null,
        height: img.height ?? null,
        fileSize: img.fileSize ?? null,
        isPrimary: index === primaryIndex,
      })),
    });
  }

  private async replaceImagesTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    masterId: string,
    images: unknown,
  ): Promise<void> {
    const normalized = this.normalizeImagesForWrite(images);
    await tx.masterProduct.updateMany({
      where: { id: masterId, companyId, isDeleted: false },
      data: { imageUrl: this.representativeImageUrl(normalized) },
    });
    await tx.masterProductImage.deleteMany({ where: { companyId, masterId } });
    await this.createImageRowsTx(tx, companyId, masterId, normalized);
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
   * Atomic restore for a soft-deleted master — single tenant-scoped `updateMany`
   * removes the read-then-write window and keeps the bare-id write off the SQL
   * path entirely. P2002 (e.g. legacyCode partial unique re-collision on
   * restore) still propagates through `mapPrismaError`.
   *
   * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
   *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
   */
  async restore(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = outerTx ?? this.prisma;
    try {
      const { count } = await db.masterProduct.updateMany({
        where: { id, companyId, isDeleted: true },
        data: { isDeleted: false, deletedAt: null },
      });
      if (count === 0) throw new NotFoundException('master not found or not deleted');
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
