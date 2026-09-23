import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { RegistrableThumbnailRepositoryPort } from '../../../application/port/out/repository/registrable-thumbnail.repository.port';

@Injectable()
export class RegistrableThumbnailRepositoryAdapter implements RegistrableThumbnailRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findRegistrableAsset(input: { organizationId: string; salesProductId: string; assetId: string | null }) {
    const workspace = await this.prisma.contentWorkspace.findFirst({
      where: {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
        status: 'active',
        isDeleted: false,
      },
      select: {
        id: true,
        currentThumbnailAsset: { select: { id: true, url: true, isDeleted: true } },
      },
    });
    if (!workspace) return input.assetId ? { mode: 'foreign_asset' as const } : { mode: 'none' as const };
    if (input.assetId) {
      const asset = await this.prisma.contentAsset.findFirst({
        where: {
          id: input.assetId,
          organizationId: input.organizationId,
          contentWorkspaceId: workspace.id,
          isDeleted: false,
        },
        select: { id: true, url: true },
      });
      if (!asset) return { mode: 'foreign_asset' as const };
      return { mode: 'found' as const, asset: { assetId: asset.id, contentWorkspaceId: workspace.id, url: asset.url } };
    }
    const current = workspace.currentThumbnailAsset;
    if (!current || current.isDeleted) return { mode: 'none' as const };
    return { mode: 'found' as const, asset: { assetId: current.id, contentWorkspaceId: workspace.id, url: current.url } };
  }

  async findAssetUrl(input: { organizationId: string; assetId: string }): Promise<string | null> {
    const asset = await this.prisma.contentAsset.findFirst({
      where: { id: input.assetId, organizationId: input.organizationId, isDeleted: false },
      select: { url: true },
    });
    return asset?.url ?? null;
  }
}
