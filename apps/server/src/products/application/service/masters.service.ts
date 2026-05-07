// apps/server/src/products/application/service/masters.service.ts
import { randomUUID } from 'node:crypto';
import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { MasterProduct, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import type { MulterFile } from '../../../common/types';
import type { MasterImageItem } from '@kiditem/shared/product';
import { MasterCodeService } from '../../adapter/out/prisma/master-code.service';
import { CreateMasterDto } from '../../dto/create-master.dto';
import { UpdateMasterDto } from '../../dto/update-master.dto';
import { ListMastersQuery } from '../../dto/list-masters.query';
import { mapPrismaError } from '../../util/prisma-error';
import { normalizeMasterImages } from '../../domain/service/product-image-normalizer';
import {
  MASTER_WITH_IMAGES,
  type MasterWithImageRows,
  findMasterById,
  findMasterByCode,
  findMasterByLegacy,
  findMasterImageRows,
  findMasterListPage,
} from '../../adapter/out/prisma/master-product.query';
import { toMasterImageItem, withImageRows } from '../../mapper/master-product.mapper';
import {
  normalizeImagesForWrite,
  primaryImageIndex,
  representativeImageUrl,
} from '../../domain/service/master-image-normalizer';
import {
  PublicImageUrlError,
  assertPublicHttpUrl,
} from '../../domain/policy/public-image-url';

const SYSTEM_FIELDS = [
  'id', 'code', 'organizationId', 'optionCounter', 'isDeleted', 'deletedAt',
  'healthUpdatedAt', 'rawData', 'processedData', 'draftContent',
  'createdAt', 'updatedAt', 'images', 'imageUrl',
] as const;

function assertPublicHttpUrlForHttp(url: string): void {
  try {
    assertPublicHttpUrl(url);
  } catch (error) {
    if (error instanceof PublicImageUrlError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

function isJsonObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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
    organizationId: string,
    dto: CreateMasterDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<MasterProduct> {
    const stripped = this.strip(dto);
    try {
      const normalizedImages = normalizeImagesForWrite(
        dto.images ?? (dto.imageUrl ? [{ url: dto.imageUrl, role: 'product', label: null, sortOrder: 0 }] : []),
      );
      const rawData = this.rawDataForCreate(dto, normalizedImages);
      const createInTx = async (tx: Prisma.TransactionClient) => {
        const code = await this.codeSvc.generate(tx);
        const row = await tx.masterProduct.create({
          data: {
            ...stripped,
            organizationId,
            code,
            imageUrl: representativeImageUrl(normalizedImages),
            ...(rawData ? { rawData } : {}),
            healthUpdatedAt: dto.healthScore !== undefined ? new Date() : null,
          } as Prisma.MasterProductUncheckedCreateInput,
        });
        await this.createImageRowsTx(tx, organizationId, row.id, normalizedImages);
        const created = await tx.masterProduct.findFirst({
          where: { id: row.id, organizationId },
          include: MASTER_WITH_IMAGES,
        }) as MasterWithImageRows | null;
        if (!created) throw new NotFoundException('master not found');
        return created;
      };
      const row = outerTx ? await createInTx(outerTx) : await this.prisma.$transaction(createInTx);
      return withImageRows(row);
    } catch (e) { mapPrismaError(e, 'master create'); }
  }

  async list(organizationId: string, q: ListMastersQuery) {
    const { items, nextCursor } = await findMasterListPage(this.prisma, organizationId, q);
    return { items: items.map(withImageRows), nextCursor };
  }

  async findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<MasterProduct> {
    const row = await findMasterById(this.prisma, organizationId, id, opts);
    if (!row) throw new NotFoundException('master not found');
    return withImageRows(row);
  }

  async findByCode(organizationId: string, code: string): Promise<MasterProduct> {
    const row = await findMasterByCode(this.prisma, organizationId, code);
    if (!row) throw new NotFoundException('master not found');
    return withImageRows(row);
  }

  async findByLegacy(organizationId: string, legacyCode: string): Promise<MasterProduct> {
    const row = await findMasterByLegacy(this.prisma, organizationId, legacyCode);
    if (!row) throw new NotFoundException('master not found');
    return withImageRows(row);
  }

  /**
   * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
   *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
   */
  async update(
    organizationId: string,
    id: string,
    dto: UpdateMasterDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<MasterProduct> {
    const stripped = this.strip(dto);
    const data = { ...stripped } as Prisma.MasterProductUncheckedUpdateInput;
    if (dto.healthScore !== undefined) data.healthUpdatedAt = new Date();
    if (dto.isTemporary === false) data.temporaryReason = null;
    try {
      const updateInTx = async (tx: Prisma.TransactionClient) => {
        const { count } = await tx.masterProduct.updateMany({
          where: { id, organizationId, isDeleted: false },
          data,
        });
        if (count === 0) throw new NotFoundException('master not found or deleted');
        if (dto.images !== undefined || dto.imageUrl !== undefined) {
          await this.replaceImagesTx(
            tx,
            organizationId,
            id,
            dto.images ?? (dto.imageUrl ? [{ url: dto.imageUrl, role: 'product', label: null, sortOrder: 0 }] : []),
          );
        }
        const updated = await tx.masterProduct.findFirst({
          where: { id, organizationId, isDeleted: false },
          include: MASTER_WITH_IMAGES,
        }) as MasterWithImageRows | null;
        if (!updated) throw new NotFoundException('master not found or deleted');
        return updated;
      };
      const row = outerTx ? await updateInTx(outerTx) : await this.prisma.$transaction(updateInTx);
      return withImageRows(row);
    } catch (e) { mapPrismaError(e, 'master update'); }
  }

  async addRawDataField(
    organizationId: string,
    id: string,
    key: string,
    value: string,
  ): Promise<{ rawData: Prisma.JsonObject }> {
    const trimmedKey = key.trim();
    if (!trimmedKey) throw new BadRequestException('raw data key is required');

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.masterProduct.findFirst({
        where: { id, organizationId, isDeleted: false },
        select: { rawData: true },
      });
      if (!row) throw new NotFoundException('master not found or deleted');

      const nextRawData: Prisma.JsonObject = {
        ...(isJsonObject(row.rawData) ? row.rawData : {}),
        [trimmedKey]: value,
      };
      const { count } = await tx.masterProduct.updateMany({
        where: { id, organizationId, isDeleted: false },
        data: { rawData: nextRawData },
      });
      if (count === 0) throw new NotFoundException('master not found or deleted');
      return nextRawData;
    });

    return { rawData: updated };
  }

  /**
   * Read the normalized image list for a master. Wraps the read-model image
   * query + a master-existence fallback so controllers can emit `{ images }`
   * envelopes without duplicating the read-path lenience logic.
   */
  async getImages(
    organizationId: string,
    id: string,
  ): Promise<MasterImageItem[]> {
    const rows = await findMasterImageRows(this.prisma, organizationId, id);
    if (rows.length === 0) await this.findById(organizationId, id, {});
    return rows.map(toMasterImageItem);
  }

  async updateImages(
    organizationId: string,
    id: string,
    images: unknown,
  ): Promise<MasterProduct> {
    const row = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.masterProduct.updateMany({
        where: { id, organizationId, isDeleted: false },
        data: { imageUrl: representativeImageUrl(normalizeImagesForWrite(images)) },
      });
      if (count === 0) throw new NotFoundException('master not found or deleted');
      await this.replaceImagesTx(tx, organizationId, id, images);
      const updated = await tx.masterProduct.findFirst({
        where: { id, organizationId, isDeleted: false },
        include: MASTER_WITH_IMAGES,
      }) as MasterWithImageRows | null;
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
    organizationId: string,
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
    await this.findById(organizationId, id, {});
    const key = `product-images/${id}/${randomUUID()}.${ext}`;
    const url = await this.storage.save(key, file.buffer, file.mimetype);
    const row = await this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.masterProductImage.count({
        where: { organizationId, masterId: id, isDeleted: false },
      });
      const image = await tx.masterProductImage.create({
        data: {
          organizationId,
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
          where: { id, organizationId, isDeleted: false },
          data: { imageUrl: url },
        });
      }
      return image;
    });
    return toMasterImageItem(row);
  }

  async originalImageBase64(
    organizationId: string,
    id: string,
  ): Promise<{ dataUrl: string }> {
    const row = await this.findById(organizationId, id, {});
    const images = normalizeMasterImages((row as unknown as { images: unknown }).images);
    const url = row.imageUrl ?? images[0]?.url ?? row.thumbnailUrl ?? null;
    if (!url) throw new NotFoundException('image not found');
    // Minimum SSRF defense: only http(s), block internal hosts. Full domain allowlist
    // is a follow-up (see TODOS.md "originalImageBase64 SSRF allowlist").
    assertPublicHttpUrlForHttp(url);
    const res = await fetch(url);
    if (!res.ok) throw new NotFoundException('image not found');
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { dataUrl: `data:${contentType};base64,${buffer.toString('base64')}` };
  }

  async getPreview(
    organizationId: string,
    id: string,
  ): Promise<{ template: string | null; data: Record<string, unknown> }> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { processedData: true, draftContent: true },
    });
    if (!row) throw new NotFoundException('master not found');
    const data = (row.processedData ?? row.draftContent) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return { template: null, data: {} };
    return { template: 'bold-vertical', data };
  }

  async saveEditedHtml(
    organizationId: string,
    id: string,
    html: string,
  ): Promise<{ ok: true }> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { draftContent: true },
    });
    if (!row) throw new NotFoundException('master not found');
    const existing = (row.draftContent ?? {}) as Record<string, unknown>;
    const next = {
      ...existing,
      editedHtml: html,
      editedHtmlSavedAt: new Date().toISOString(),
    };
    const { count } = await this.prisma.masterProduct.updateMany({
      where: { id, organizationId, isDeleted: false },
      data: { draftContent: next as Prisma.InputJsonValue },
    });
    if (count === 0) throw new NotFoundException('master not found');
    return { ok: true };
  }

  async getEditedHtml(
    organizationId: string,
    id: string,
  ): Promise<{ html: string | null; savedAt: string | null }> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { draftContent: true },
    });
    if (!row) throw new NotFoundException('master not found');
    const draftContent = (row.draftContent ?? {}) as Record<string, unknown>;
    return {
      html: typeof draftContent.editedHtml === 'string' ? draftContent.editedHtml : null,
      savedAt: typeof draftContent.editedHtmlSavedAt === 'string'
        ? draftContent.editedHtmlSavedAt
        : null,
    };
  }

  async getGenerationHistory(
    organizationId: string,
    id: string,
    limit = 20,
  ): Promise<Array<{
    id: string;
    generatedTitle: string | null;
    status: string;
    detailPageData: Record<string, unknown> | null;
    errorMessage: string | null;
    createdAt: Date;
  }>> {
    await this.findById(organizationId, id, {});
    const rows = await this.prisma.contentGeneration.findMany({
      where: { masterId: id, organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        generatedTitle: true,
        status: true,
        detailPageHtml: true,
        errorMessage: true,
        createdAt: true,
      },
    });

    return rows
      .filter((row) => !this.isAiDetailGeneration(row.detailPageHtml))
      .map((row) => ({
        id: row.id,
        generatedTitle: row.generatedTitle,
        status: row.status,
        detailPageData: this.parseDetailPageData(row.detailPageHtml),
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
      }));
  }

  async deleteGenerationHistory(
    organizationId: string,
    masterId: string,
    generationId: string,
  ): Promise<{ ok: true }> {
    const { count } = await this.prisma.contentGeneration.deleteMany({
      where: { id: generationId, masterId, organizationId },
    });
    if (count === 0) throw new NotFoundException('generation history row not found');
    return { ok: true };
  }

  private parseDetailPageData(raw: string | null): Record<string, unknown> | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const record = parsed as Record<string, unknown>;
      const result = record.result;
      if (result && typeof result === 'object') {
        return {
          ...record,
          ...(result as Record<string, unknown>),
        };
      }
      return record;
    } catch {
      return null;
    }
  }

  private isAiDetailGeneration(raw: string | null): boolean {
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed.templateId === 'kids-playful' ||
        parsed.templateId === 'bold-vertical' ||
        parsed.templateId === 'simple-vertical';
    } catch {
      return false;
    }
  }

  private async createImageRowsTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    masterId: string,
    images: MasterImageItem[],
  ): Promise<void> {
    if (images.length === 0) return;
    const primary = primaryImageIndex(images);
    await tx.masterProductImage.createMany({
      data: images.map((img, index) => ({
        organizationId,
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
        isPrimary: index === primary,
      })),
    });
  }

  private rawDataForCreate(
    dto: CreateMasterDto,
    images: MasterImageItem[],
  ): Prisma.InputJsonValue | null {
    if (dto.sourcePlatform !== 'detail-page-generator') return null;

    const imageUrls = images.map((img) => img.url).filter((url) => url.trim() !== '');
    return {
      title: dto.name,
      productName: dto.name,
      name: dto.name,
      description: dto.description ?? '',
      category: dto.category ?? null,
      category_name: dto.category ?? null,
      images: imageUrls,
      imageUrls,
      image_urls: imageUrls,
      source_platform: dto.sourcePlatform,
      sourcePlatform: dto.sourcePlatform,
      source_url: dto.sourceUrl ?? null,
      sourceUrl: dto.sourceUrl ?? null,
      collected_from: 'detail-page-generator',
    };
  }

  private async replaceImagesTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    masterId: string,
    images: unknown,
  ): Promise<void> {
    const normalized = normalizeImagesForWrite(images);
    await tx.masterProduct.updateMany({
      where: { id: masterId, organizationId, isDeleted: false },
      data: { imageUrl: representativeImageUrl(normalized) },
    });
    await tx.masterProductImage.deleteMany({ where: { organizationId, masterId } });
    await this.createImageRowsTx(tx, organizationId, masterId, normalized);
  }

  /**
   * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
   *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
   */
  async softDelete(
    organizationId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = outerTx ?? this.prisma;
    const { count } = await db.masterProduct.updateMany({
      where: { id, organizationId, isDeleted: false },
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
    organizationId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = outerTx ?? this.prisma;
    try {
      const { count } = await db.masterProduct.updateMany({
        where: { id, organizationId, isDeleted: true },
        data: { isDeleted: false, deletedAt: null },
      });
      if (count === 0) throw new NotFoundException('master not found or not deleted');
    } catch (e) { mapPrismaError(e, 'master restore'); }
  }

  /**
   * Remove SYSTEM_FIELDS from a DTO before forwarding to Prisma. The return
   * type preserves the caller's input type minus the stripped keys so call
   * sites don't need a loose `Record<string, unknown>` intermediate cast
   * (apps/server/AGENTS.md forbids that pattern). The remaining cast to
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
