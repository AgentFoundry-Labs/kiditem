import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProductGenerationContextRepositoryPort,
} from '../../../application/port/out/repository/product-generation-context.repository.port';

@Injectable()
export class ProductGenerationContextRepositoryAdapter
implements ProductGenerationContextRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findExistingChildren(input: {
    organizationId: string;
    detailGenerationId: string;
    thumbnailGenerationId: string;
  }): Promise<{
    detail: {
      generationId: string;
      requestHash: string | null;
      contentWorkspaceId: string;
      isDeleted: boolean;
    } | null;
    thumbnail: { generationId: string; requestHash: string | null; isDeleted: boolean } | null;
  }> {
    const [detail, thumbnail] = await Promise.all([
      this.prisma.contentGeneration.findFirst({
        where: {
          id: input.detailGenerationId,
          organizationId: input.organizationId,
        },
        select: { id: true, generationInput: true, contentWorkspaceId: true, isDeleted: true },
      }),
      this.prisma.thumbnailGeneration.findFirst({
        where: {
          id: input.thumbnailGenerationId,
          organizationId: input.organizationId,
        },
        select: { id: true, inputMeta: true, isDeleted: true },
      }),
    ]);
    return {
      detail: detail
        ? {
        generationId: detail.id,
        requestHash: readProductGenerationRequestHash(detail.generationInput),
        contentWorkspaceId: detail.contentWorkspaceId,
        isDeleted: detail.isDeleted,
      }
        : null,
      thumbnail: thumbnail
        ? {
        generationId: thumbnail.id,
        requestHash: readProductGenerationRequestHash(thumbnail.inputMeta),
        isDeleted: thumbnail.isDeleted,
      }
        : null,
    };
  }
}

function readProductGenerationRequestHash(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const requestHash = (value as Record<string, unknown>).productGenerationRequestHash;
  return typeof requestHash === 'string' ? requestHash : null;
}
