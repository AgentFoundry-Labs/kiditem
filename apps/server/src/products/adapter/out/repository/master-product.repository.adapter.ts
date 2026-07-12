import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  GenerationHistoryRow,
  MasterBarcodeOwnerRow,
  MasterImageWriteInput,
  MasterProductImageRow,
  MasterProductRepositoryPort,
  MasterWithImageRows,
  ProductContentCardRow,
} from '../../../application/port/out/repository/master-product.repository.port';
import type { ProductsRepositoryTransaction } from '../../../application/port/out/transaction/products-transaction.port';
import {
  findMasterByCode,
  findMasterById,
  findMasterByLegacy,
  findMasterImageRows,
  findMasterListPage,
  MASTER_WITH_IMAGES,
} from './master-product.query';
import {
  normalizeImagesForWrite,
  representativeImageUrl,
} from '../../../domain/service/master-image-normalizer';
import type { ListMastersQuery } from '../../../dto/list-masters.query';
import { PRODUCTS_OWNED_MASTER_SCOPE } from './master-product-scope';

function tx(value: ProductsRepositoryTransaction): Prisma.TransactionClient {
  return value as Prisma.TransactionClient;
}

@Injectable()
export class MasterProductRepositoryAdapter implements MasterProductRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    organizationId: string;
    data: Record<string, unknown>;
    images: MasterImageWriteInput[];
    tx: ProductsRepositoryTransaction;
  }): Promise<MasterWithImageRows> {
    const client = tx(input.tx);
    const row = await client.masterProduct.create({
      data: input.data as Prisma.MasterProductUncheckedCreateInput,
    });
    await this.createImageRowsTx(client, input.organizationId, row.id, input.images);
    const created = await client.masterProduct.findFirst({
      where: { id: row.id, organizationId: input.organizationId },
      include: MASTER_WITH_IMAGES,
    }) as MasterWithImageRows | null;
    if (!created) throw new NotFoundException('master not found');
    return created;
  }

  async createPromoted(input: {
    organizationId: string;
    data: Record<string, unknown>;
    images: MasterImageWriteInput[];
    tx: ProductsRepositoryTransaction;
  }): Promise<{ id: string }> {
    const client = tx(input.tx);
    const created = await client.masterProduct.create({
      data: input.data as Prisma.MasterProductUncheckedCreateInput,
      select: { id: true },
    });
    await this.createImageRowsTx(client, input.organizationId, created.id, input.images);
    return created;
  }

  list(
    organizationId: string,
    query: ListMastersQuery,
  ): Promise<{ items: MasterWithImageRows[]; nextCursor: string | null }> {
    return findMasterListPage(this.prisma, organizationId, query);
  }

  findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<MasterWithImageRows | null> {
    return findMasterById(this.prisma, organizationId, id, opts);
  }

  findByCode(organizationId: string, code: string): Promise<MasterWithImageRows | null> {
    return findMasterByCode(this.prisma, organizationId, code);
  }

  findByLegacy(organizationId: string, legacyCode: string): Promise<MasterWithImageRows | null> {
    return findMasterByLegacy(this.prisma, organizationId, legacyCode);
  }

  findActiveBarcodeOwners(input: {
    organizationId: string;
    barcode: string;
    tx: ProductsRepositoryTransaction;
  }): Promise<MasterBarcodeOwnerRow[]> {
    const client = tx(input.tx);
    return client.masterProduct.findMany({
      where: {
        ...PRODUCTS_OWNED_MASTER_SCOPE,
        organizationId: input.organizationId,
        barcode: input.barcode,
        isDeleted: false,
      },
      select: { id: true, code: true, name: true },
    });
  }

  async update(input: {
    organizationId: string;
    id: string;
    data: Record<string, unknown>;
    images?: unknown;
    tx: ProductsRepositoryTransaction;
  }): Promise<MasterWithImageRows> {
    const client = tx(input.tx);
    const { count } = await client.masterProduct.updateMany({
      where: {
        ...PRODUCTS_OWNED_MASTER_SCOPE,
        id: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: input.data as Prisma.MasterProductUncheckedUpdateInput,
    });
    if (count === 0) throw new NotFoundException('master not found or deleted');
    if (input.images !== undefined) {
      await this.replaceImagesTx(client, input.organizationId, input.id, input.images);
    }
    const updated = await client.masterProduct.findFirst({
      where: {
        ...PRODUCTS_OWNED_MASTER_SCOPE,
        id: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      include: MASTER_WITH_IMAGES,
    }) as MasterWithImageRows | null;
    if (!updated) throw new NotFoundException('master not found or deleted');
    return updated;
  }

  findImageRows(organizationId: string, masterId: string): Promise<MasterProductImageRow[]> {
    return findMasterImageRows(this.prisma, organizationId, masterId);
  }

  async updateImages(input: {
    organizationId: string;
    id: string;
    images: unknown;
  }): Promise<MasterWithImageRows> {
    return this.prisma.$transaction(async (client) => {
      const normalized = normalizeImagesForWrite(input.images);
      const { count } = await client.masterProduct.updateMany({
        where: {
          ...PRODUCTS_OWNED_MASTER_SCOPE,
          id: input.id,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: { imageUrl: representativeImageUrl(normalized) },
      });
      if (count === 0) throw new NotFoundException('master not found or deleted');
      await this.replaceImagesTx(client, input.organizationId, input.id, normalized);
      const updated = await client.masterProduct.findFirst({
        where: {
          ...PRODUCTS_OWNED_MASTER_SCOPE,
          id: input.id,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        include: MASTER_WITH_IMAGES,
      }) as MasterWithImageRows | null;
      if (!updated) throw new NotFoundException('master not found or deleted');
      return updated;
    });
  }

  async createUploadedImage(input: {
    organizationId: string;
    masterId: string;
    url: string;
    storageKey: string;
    mimeType: string;
    fileSize: number;
  }): Promise<MasterProductImageRow> {
    return this.prisma.$transaction(async (client) => {
      const master = await client.masterProduct.findFirst({
        where: {
          ...PRODUCTS_OWNED_MASTER_SCOPE,
          id: input.masterId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!master) throw new NotFoundException('master not found');
      const existingCount = await client.masterProductImage.count({
        where: { organizationId: input.organizationId, masterId: input.masterId, isDeleted: false },
      });
      const image = await client.masterProductImage.create({
        data: {
          organizationId: input.organizationId,
          masterId: input.masterId,
          url: input.url,
          storageKey: input.storageKey,
          role: 'product',
          label: null,
          sortOrder: existingCount,
          source: 'upload',
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          isPrimary: existingCount === 0,
        },
      });
      if (existingCount === 0) {
        await client.masterProduct.updateMany({
          where: {
            ...PRODUCTS_OWNED_MASTER_SCOPE,
            id: input.masterId,
            organizationId: input.organizationId,
            isDeleted: false,
          },
          data: { imageUrl: input.url },
        });
      }
      return image;
    });
  }

  findPreviewData(
    organizationId: string,
    id: string,
  ): Promise<{ processedData: unknown; draftContent: unknown } | null> {
    return this.prisma.masterProduct.findFirst({
      where: { ...PRODUCTS_OWNED_MASTER_SCOPE, id, organizationId, isDeleted: false },
      select: { processedData: true, draftContent: true },
    });
  }

  findDraftContent(organizationId: string, id: string): Promise<{ draftContent: unknown } | null> {
    return this.prisma.masterProduct.findFirst({
      where: { ...PRODUCTS_OWNED_MASTER_SCOPE, id, organizationId, isDeleted: false },
      select: { draftContent: true },
    });
  }

  async saveDraftContent(organizationId: string, id: string, draftContent: unknown): Promise<number> {
    const { count } = await this.prisma.masterProduct.updateMany({
      where: { ...PRODUCTS_OWNED_MASTER_SCOPE, id, organizationId, isDeleted: false },
      data: { draftContent: draftContent as Prisma.InputJsonValue },
    });
    return count;
  }

  async listProductContentCards(input: {
    organizationId: string;
    productId?: string | null;
    page: number;
    limit: number;
    templateIds: readonly string[];
  }): Promise<{ total: number; rows: ProductContentCardRow[] }> {
    const where: Prisma.ContentGenerationWhereInput = {
      organizationId: input.organizationId,
      contentType: 'detail_page',
      templateId: { in: [...input.templateIds] },
      generationGroup: {
        targetMasterId: input.productId ?? { not: null },
        targetMaster: { ...PRODUCTS_OWNED_MASTER_SCOPE, isDeleted: false },
      },
    };

    const [total, rows] = await Promise.all([
      this.prisma.contentGeneration.count({ where }),
      this.prisma.contentGeneration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        select: {
          id: true,
          generatedTitle: true,
          status: true,
          generationInput: true,
          generationResult: true,
          errorMessage: true,
          editedHtmlSavedAt: true,
          createdAt: true,
          updatedAt: true,
          generationGroup: {
            select: {
              targetMaster: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  thumbnailUrl: true,
                  imageUrl: true,
                  isTemporary: true,
                  images: {
                    where: { isDeleted: false },
                    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                    select: { url: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    return { total, rows: rows as ProductContentCardRow[] };
  }

  findGenerationHistoryRows(input: {
    organizationId: string;
    masterId: string;
    limit: number;
  }): Promise<GenerationHistoryRow[]> {
    return this.prisma.contentGeneration.findMany({
      where: {
        organizationId: input.organizationId,
        generationGroup: {
          targetMasterId: input.masterId,
          targetMaster: PRODUCTS_OWNED_MASTER_SCOPE,
        },
        NOT: { contentType: 'detail_page' },
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      select: {
        id: true,
        generatedTitle: true,
        status: true,
        generationResult: true,
        errorMessage: true,
        createdAt: true,
      },
    });
  }

  async deleteGenerationHistory(input: {
    organizationId: string;
    masterId: string;
    generationId: string;
  }): Promise<number> {
    const { count } = await this.prisma.contentGeneration.deleteMany({
      where: {
        id: input.generationId,
        organizationId: input.organizationId,
        generationGroup: {
          targetMasterId: input.masterId,
          targetMaster: PRODUCTS_OWNED_MASTER_SCOPE,
        },
      },
    });
    return count;
  }

  async softDelete(
    organizationId: string,
    id: string,
    repositoryTx?: ProductsRepositoryTransaction,
  ): Promise<number> {
    const client = repositoryTx ? tx(repositoryTx) : this.prisma;
    const { count } = await client.masterProduct.updateMany({
      where: { ...PRODUCTS_OWNED_MASTER_SCOPE, id, organizationId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return count;
  }

  async restore(
    organizationId: string,
    id: string,
    repositoryTx?: ProductsRepositoryTransaction,
  ): Promise<number> {
    const client = repositoryTx ? tx(repositoryTx) : this.prisma;
    const { count } = await client.masterProduct.updateMany({
      where: { ...PRODUCTS_OWNED_MASTER_SCOPE, id, organizationId, isDeleted: true },
      data: { isDeleted: false, deletedAt: null },
    });
    return count;
  }

  private async createImageRowsTx(
    client: Prisma.TransactionClient,
    organizationId: string,
    masterId: string,
    images: MasterImageWriteInput[],
  ): Promise<void> {
    if (images.length === 0) return;
    const primary = images.findIndex((img) => img.isPrimary === true);
    const primaryIndex = primary >= 0 ? primary : 0;
    await client.masterProductImage.createMany({
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
        isPrimary: index === primaryIndex,
      })),
    });
  }

  private async replaceImagesTx(
    client: Prisma.TransactionClient,
    organizationId: string,
    masterId: string,
    images: unknown,
  ): Promise<void> {
    const normalized = normalizeImagesForWrite(images);
    await client.masterProduct.updateMany({
      where: { id: masterId, organizationId, isDeleted: false },
      data: { imageUrl: representativeImageUrl(normalized) },
    });
    await client.masterProductImage.deleteMany({ where: { organizationId, masterId } });
    await this.createImageRowsTx(client, organizationId, masterId, normalized);
  }
}
