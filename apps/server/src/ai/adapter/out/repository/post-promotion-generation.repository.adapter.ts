import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  PostPromotionGenerationRepositoryPort,
  PostPromotionThumbnailGenerationInput,
} from '../../../application/port/out/post-promotion-generation.repository.port';

@Injectable()
export class PostPromotionGenerationRepositoryAdapter
implements PostPromotionGenerationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMasterContext(input: { organizationId: string; masterId: string }) {
    const master = await this.prisma.masterProduct.findFirst({
      where: {
        id: input.masterId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        imageUrl: true,
      },
    });
    if (!master) return null;

    const masterImages = await this.prisma.masterProductImage.findMany({
      where: {
        masterId: input.masterId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      orderBy: { sortOrder: 'asc' },
      select: { url: true },
    });
    return {
      ...master,
      imageUrls: masterImages
        .map((row) => row.url)
        .filter((url): url is string => typeof url === 'string' && url.length > 0),
    };
  }

  createDetailPageGeneration(input: {
    organizationId: string;
    generationGroupId: string;
    rawInput: unknown;
    generationResult: unknown;
    generatedTitle: string;
  }): Promise<{ id: string }> {
    return this.prisma.contentGeneration.create({
      data: {
        organizationId: input.organizationId,
        contentType: 'detail_page',
        generationGroupId: input.generationGroupId,
        triggeredByUserId: null,
        generationInput: input.rawInput as Prisma.InputJsonValue,
        generationResult: input.generationResult as Prisma.InputJsonValue,
        generatedTitle: input.generatedTitle,
        status: 'PROCESSING',
      },
      select: { id: true },
    });
  }

  async markDetailPageFailed(input: {
    organizationId: string;
    contentGenerationId: string;
    errorMessage: string;
  }): Promise<void> {
    await this.prisma.contentGeneration.updateMany({
      where: {
        id: input.contentGenerationId,
        organizationId: input.organizationId,
      },
      data: { status: 'FAILED', errorMessage: input.errorMessage },
    });
  }

  async createThumbnailGeneration(
    input: PostPromotionThumbnailGenerationInput,
  ): Promise<{ id: string }> {
    const generation = await this.prisma.thumbnailGeneration.create({
      data: {
        organizationId: input.organizationId,
        masterId: input.masterId,
        originalUrl: input.originalUrl,
        method: 'generate',
        status: 'pending',
        phase: null,
        inputMeta: input.inputMeta as Prisma.InputJsonValue,
        triggeredByUserId: null,
      },
      select: { id: true },
    });

    await this.prisma.thumbnailGenerationInputImage.create({
      data: {
        organizationId: input.organizationId,
        generationId: generation.id,
        url: input.inputImage.url,
        storageKey: input.inputImage.storageKey,
        role: input.inputImage.role,
        label: input.inputImage.label,
        sortOrder: input.inputImage.sortOrder,
        source: input.inputImage.source,
        mimeType: input.inputImage.mimeType,
        fileSize: input.inputImage.fileSize,
      },
    });

    return generation;
  }

  async markThumbnailFailed(input: {
    organizationId: string;
    generationId: string;
    errorMessage: string;
  }): Promise<void> {
    await this.prisma.thumbnailGeneration.updateMany({
      where: {
        id: input.generationId,
        organizationId: input.organizationId,
      },
      data: { status: 'failed', phase: null, errorMessage: input.errorMessage },
    });
  }
}
