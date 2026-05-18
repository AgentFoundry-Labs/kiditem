// apps/server/src/products/application/service/masters.service.ts
import { randomUUID } from 'node:crypto';
import {
  BadRequestException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { StorageService } from '../../../common/storage/storage.service';
import type { MulterFile } from '../../../common/types';
import type { MasterImageItem } from '@kiditem/shared/product';
import { CreateMasterDto } from '../../dto/create-master.dto';
import { UpdateMasterDto } from '../../dto/update-master.dto';
import { ListMastersQuery } from '../../dto/list-masters.query';
import { mapPrismaError } from '../../util/prisma-error';
import { normalizeMasterImages } from '../../domain/service/product-image-normalizer';
import {
  MASTER_CODE_PORT,
  type MasterCodePort,
} from '../port/out/master-code.port';
import {
  MASTER_PRODUCT_REPOSITORY_PORT,
  type MasterProductRepositoryPort,
  type ProductBoundContentCardRow,
} from '../port/out/master-product.repository.port';
import {
  PRODUCTS_TRANSACTION_PORT,
  type ProductsRepositoryTransaction,
  type ProductsTransactionPort,
} from '../port/out/products-transaction.port';
import { toMasterImageItem, withImageRows } from '../../mapper/master-product.mapper';
import {
  normalizeImagesForWrite,
  representativeImageUrl,
} from '../../domain/service/master-image-normalizer';
import {
  PublicImageUrlError,
  assertPublicHttpUrl,
} from '../../domain/policy/public-image-url';

const SYSTEM_FIELDS = [
  'id', 'code', 'organizationId', 'optionCounter', 'isDeleted', 'deletedAt',
  'healthUpdatedAt', 'processedData', 'draftContent',
  'createdAt', 'updatedAt', 'images', 'imageUrl',
] as const;

const AI_DETAIL_TEMPLATE_IDS = ['kids-playful', 'bold-vertical', 'simple-vertical'] as const;

export interface ListContentCardsQuery {
  page?: number;
  limit?: number;
  productId?: string | null;
}

export interface ProductContentCard {
  generationId: string;
  productId: string;
  productCode: string;
  productName: string;
  title: string;
  subtitle: string | null;
  templateId: 'kids-playful' | 'bold-vertical';
  status: string;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  isTemporaryProduct: boolean;
  editedHtmlSavedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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

@Injectable()
export class MastersService {
  constructor(
    @Inject(MASTER_PRODUCT_REPOSITORY_PORT)
    private readonly masters: MasterProductRepositoryPort,
    @Inject(MASTER_CODE_PORT)
    private readonly codeSvc: MasterCodePort,
    @Inject(PRODUCTS_TRANSACTION_PORT)
    private readonly transactions: ProductsTransactionPort,
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
    outerTx?: ProductsRepositoryTransaction,
  ) {
    const stripped = this.strip(dto);
    try {
      const normalizedImages = normalizeImagesForWrite(
        dto.images ?? (dto.imageUrl ? [{ url: dto.imageUrl, role: 'product', label: null, sortOrder: 0 }] : []),
      );
      const createInTx = async (tx: ProductsRepositoryTransaction) => {
        const code = await this.codeSvc.generate(tx);
        const row = await this.masters.create({
          organizationId,
          tx,
          images: normalizedImages,
          data: {
            ...stripped,
            organizationId,
            code,
            imageUrl: representativeImageUrl(normalizedImages),
            healthUpdatedAt: dto.healthScore !== undefined ? new Date() : null,
          },
        });
        return row;
      };
      const row = outerTx ? await createInTx(outerTx) : await this.transactions.run(createInTx);
      return withImageRows(row);
    } catch (e) { mapPrismaError(e, 'master create'); }
  }

  async list(organizationId: string, q: ListMastersQuery) {
    const { items, nextCursor } = await this.masters.list(organizationId, q);
    return { items: items.map(withImageRows), nextCursor };
  }

  async findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ) {
    const row = await this.masters.findById(organizationId, id, opts);
    if (!row) throw new NotFoundException('master not found');
    return withImageRows(row);
  }

  async findByCode(organizationId: string, code: string) {
    const row = await this.masters.findByCode(organizationId, code);
    if (!row) throw new NotFoundException('master not found');
    return withImageRows(row);
  }

  async findByLegacy(organizationId: string, legacyCode: string) {
    const row = await this.masters.findByLegacy(organizationId, legacyCode);
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
    outerTx?: ProductsRepositoryTransaction,
  ) {
    const stripped = this.strip(dto);
    const data: Record<string, unknown> = { ...stripped };
    if (dto.healthScore !== undefined) data.healthUpdatedAt = new Date();
    if (dto.isTemporary === false) data.temporaryReason = null;
    try {
      const updateInTx = async (tx: ProductsRepositoryTransaction) => {
        const images = dto.images !== undefined || dto.imageUrl !== undefined
          ? dto.images ?? (dto.imageUrl ? [{ url: dto.imageUrl, role: 'product', label: null, sortOrder: 0 }] : [])
          : undefined;
        return this.masters.update({
          organizationId,
          id,
          data,
          images,
          tx,
        });
      };
      const row = outerTx ? await updateInTx(outerTx) : await this.transactions.run(updateInTx);
      return withImageRows(row);
    } catch (e) { mapPrismaError(e, 'master update'); }
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
    const rows = await this.masters.findImageRows(organizationId, id);
    if (rows.length === 0) await this.findById(organizationId, id, {});
    return rows.map(toMasterImageItem);
  }

  async updateImages(
    organizationId: string,
    id: string,
    images: unknown,
  ) {
    const row = await this.masters.updateImages({ organizationId, id, images });
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
    const row = await this.masters.createUploadedImage({
      organizationId,
      masterId: id,
      url,
      storageKey: key,
      mimeType: file.mimetype,
      fileSize: file.size,
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
    // Minimum SSRF defense: only http(s), block internal hosts.
    // Keep stricter host policy in public-image-url.ts with matching tests.
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
    const row = await this.masters.findPreviewData(organizationId, id);
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
    const row = await this.masters.findDraftContent(organizationId, id);
    if (!row) throw new NotFoundException('master not found');
    const existing = (row.draftContent ?? {}) as Record<string, unknown>;
    const next = {
      ...existing,
      editedHtml: html,
      editedHtmlSavedAt: new Date().toISOString(),
    };
    const count = await this.masters.saveDraftContent(organizationId, id, next);
    if (count === 0) throw new NotFoundException('master not found');
    return { ok: true };
  }

  async getEditedHtml(
    organizationId: string,
    id: string,
  ): Promise<{ html: string | null; savedAt: string | null }> {
    const row = await this.masters.findDraftContent(organizationId, id);
    if (!row) throw new NotFoundException('master not found');
    const draftContent = (row.draftContent ?? {}) as Record<string, unknown>;
    return {
      html: typeof draftContent.editedHtml === 'string' ? draftContent.editedHtml : null,
      savedAt: typeof draftContent.editedHtmlSavedAt === 'string'
        ? draftContent.editedHtmlSavedAt
        : null,
    };
  }

  async listContentCards(
    organizationId: string,
    query: ListContentCardsQuery = {},
  ): Promise<{
    items: ProductContentCard[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Number.isFinite(query.page) && query.page && query.page > 0
      ? Math.floor(query.page)
      : 1;
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(query.limit) && query.limit ? Math.floor(query.limit) : 20),
    );
    const { total, rows } = await this.masters.listProductContentCards({
      organizationId,
      productId: query.productId,
      page,
      limit,
      templateIds: AI_DETAIL_TEMPLATE_IDS,
    });
    const productRows = rows.filter((row): row is ProductBoundContentCardRow => (
      row.generationGroup.targetMaster !== null
    ));

    return {
      items: productRows.map((row) => this.toProductContentCard(row)),
      total,
      page,
      limit,
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
    const rows = await this.masters.findGenerationHistoryRows({
      organizationId,
      masterId: id,
      limit,
    });

    return rows
      .map((row) => ({
        id: row.id,
        generatedTitle: row.generatedTitle,
        status: row.status,
        detailPageData: this.parseDetailPageData(row.generationResult),
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
      }));
  }

  async deleteGenerationHistory(
    organizationId: string,
    masterId: string,
    generationId: string,
  ): Promise<{ ok: true }> {
    const count = await this.masters.deleteGenerationHistory({
      organizationId,
      masterId,
      generationId,
    });
    if (count === 0) throw new NotFoundException('generation history row not found');
    return { ok: true };
  }

  private parseDetailPageData(raw: unknown): Record<string, unknown> | null {
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
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

  private toProductContentCard(row: {
    id: string;
    generatedTitle: string | null;
    status: string;
    generationInput: unknown;
    generationResult: unknown;
    errorMessage: string | null;
    editedHtmlSavedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    generationGroup: {
      targetMaster: {
        id: string;
        code: string;
        name: string;
        thumbnailUrl: string | null;
        imageUrl: string | null;
        isTemporary: boolean;
        images: Array<{ url: string }>;
      };
    };
  }): ProductContentCard {
    const stored = this.parseAiDetailStoredJson(row.generationInput, row.generationResult);
    const processedImages = this.asStringRecord(stored.processedImages);
    const master = row.generationGroup.targetMaster;
    return {
      generationId: row.id,
      productId: master.id,
      productCode: master.code,
      productName: master.name,
      title: row.generatedTitle ?? this.pickStoredRawTitle(stored) ?? master.name,
      subtitle: this.pickDetailSubtitle(stored),
      templateId: stored.templateId,
      status: this.mapGenerationStatus(row.status),
      thumbnailUrl: this.pickContentThumbnail(row, processedImages, stored),
      errorMessage: row.errorMessage,
      isTemporaryProduct: master.isTemporary,
      editedHtmlSavedAt: row.editedHtmlSavedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private parseAiDetailStoredJson(generationInput: unknown, generationResult: unknown): {
    templateId: 'kids-playful' | 'bold-vertical';
    rawInput: Record<string, unknown>;
    result: Record<string, unknown>;
    processedImages: Record<string, unknown>;
  } {
    const inputRecord = this.asRecord(generationInput);
    const resultRecord = this.asRecord(generationResult);
    return {
      templateId:
        resultRecord.templateId === 'bold-vertical' || resultRecord.templateId === 'simple-vertical'
          ? 'bold-vertical'
          : 'kids-playful',
      rawInput: this.asRecord(resultRecord.rawInput ?? inputRecord),
      result: this.asRecord(resultRecord.result),
      processedImages: this.asRecord(resultRecord.processedImages),
    };
  }

  private pickStoredRawTitle(stored: { rawInput: Record<string, unknown> }): string | null {
    return this.pickString(stored.rawInput, 'rawTitle');
  }

  private pickDetailSubtitle(stored: {
    templateId: 'kids-playful' | 'bold-vertical';
    result: Record<string, unknown>;
  }): string | null {
    if (stored.templateId === 'bold-vertical') {
      const hook = this.asRecord(stored.result.hook);
      return this.pickString(hook, 'titleSub') ?? this.pickString(hook, 'subtext');
    }
    const section1 = this.asRecord(stored.result.section1);
    return this.pickString(section1, 'subhead');
  }

  private pickContentThumbnail(
    row: {
      generationGroup: {
        targetMaster: {
          thumbnailUrl: string | null;
          imageUrl: string | null;
          images: Array<{ url: string }>;
        };
      };
    },
    processedImages: Record<string, string>,
    stored: { templateId: 'kids-playful' | 'bold-vertical'; result: Record<string, unknown> },
  ): string | null {
    if (processedImages.__heroBanner) return processedImages.__heroBanner;
    const hook = this.asRecord(stored.result.hook);
    const section1 = this.asRecord(stored.result.section1);
    const heroIndex = stored.templateId === 'bold-vertical'
      ? this.pickNumber(hook, 'imageIndex') ?? this.pickNumber(hook, 'bannerImageIndex')
      : this.pickNumber(section1, 'heroImageIndex');
    if (heroIndex !== null && processedImages[String(heroIndex)]) {
      return processedImages[String(heroIndex)];
    }
    const master = row.generationGroup.targetMaster;
    return master.thumbnailUrl ?? master.imageUrl ?? master.images[0]?.url ?? null;
  }

  private pickEditedHtmlSavedAt(value: unknown): string | null {
    const draft = this.asRecord(value);
    return this.pickString(draft, 'editedHtmlSavedAt');
  }

  private mapGenerationStatus(status: string): string {
    if (status === 'READY' || status === 'completed') return 'completed';
    if (status === 'FAILED' || status === 'failed') return 'failed';
    if (status === 'CANCELLED' || status === 'cancelled') return 'cancelled';
    if (status === 'PROCESSING' || status === 'generating') return 'processing';
    return status.toLowerCase();
  }

  private asStringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  private pickString(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private pickNumber(record: Record<string, unknown>, key: string): number | null {
    const value = record[key];
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  }

  /**
   * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
   *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
   */
  async softDelete(
    organizationId: string,
    id: string,
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<void> {
    const count = await this.masters.softDelete(organizationId, id, outerTx);
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
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<void> {
    try {
      const count = await this.masters.restore(organizationId, id, outerTx);
      if (count === 0) throw new NotFoundException('master not found or not deleted');
    } catch (e) { mapPrismaError(e, 'master restore'); }
  }

  /**
   * Remove SYSTEM_FIELDS from a DTO before forwarding to the repository.
   * The return type preserves the caller's input type minus the stripped keys
   * so call sites don't need a loose `Record<string, unknown>` intermediate
   * cast (apps/server/AGENTS.md forbids that pattern).
   */
  private strip<T extends Partial<CreateMasterDto> | Partial<UpdateMasterDto>>(
    dto: T,
  ): Omit<T, typeof SYSTEM_FIELDS[number]> {
    const out: Record<string, unknown> = { ...dto };
    for (const f of SYSTEM_FIELDS) delete out[f as string];
    return out as Omit<T, typeof SYSTEM_FIELDS[number]>;
  }
}
