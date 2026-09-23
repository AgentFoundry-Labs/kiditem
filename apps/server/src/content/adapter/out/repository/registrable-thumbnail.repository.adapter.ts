import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  RegistrableThumbnailGenerationRow,
  RegistrableThumbnailRepositoryPort,
  RegistrableThumbnailWorkspaceRow,
} from '../../../application/port/out/repository/registrable-thumbnail.repository.port';

@Injectable()
export class RegistrableThumbnailRepositoryAdapter implements RegistrableThumbnailRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findGeneration(generationId: string, organizationId: string): Promise<RegistrableThumbnailGenerationRow | null> {
    const generation = await this.prisma.thumbnailGeneration.findFirst({
      where: { id: generationId, organizationId, isDeleted: false },
      select: {
        contentWorkspaceId: true,
        selectedUrl: true,
        candidates: {
          where: { organizationId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { url: true },
        },
        thumbnailSelections: {
          where: { organizationId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { contentAssetId: true },
        },
      },
    });
    if (!generation) return null;
    return {
      contentWorkspaceId: generation.contentWorkspaceId,
      selectedUrl: generation.selectedUrl,
      candidates: generation.candidates,
      selectedAssetId: generation.thumbnailSelections[0]?.contentAssetId ?? null,
    };
  }

  findRegistrableWorkspace(contentWorkspaceId: string, organizationId: string): Promise<RegistrableThumbnailWorkspaceRow | null> {
    return this.prisma.contentWorkspace.findFirst({
      where: { id: contentWorkspaceId, organizationId, isDeleted: false, status: 'active' },
      select: { displayName: true, salesProductId: true, channelListingId: true },
    });
  }
}
