import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { representativeAssetWhere } from './representative-asset';
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
        ownerType: true,
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
          ...representativeAssetWhere(workspace.ownerType),
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

  async readCurrentAssetIds(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ReadonlyMap<string, string | null>> {
    const ids = [...new Set(input.salesProductIds)];
    if (ids.length === 0) return new Map();
    const workspaces = await this.prisma.contentWorkspace.findMany({
      where: {
        organizationId: input.organizationId,
        ownerType: 'sales_product',
        salesProductId: { in: ids },
        status: 'active',
        isDeleted: false,
      },
      select: { salesProductId: true, currentThumbnailAsset: { select: { id: true, isDeleted: true } } },
    });
    const current = new Map<string, string | null>();
    for (const workspace of workspaces) {
      if (!workspace.salesProductId) continue;
      const asset = workspace.currentThumbnailAsset;
      current.set(workspace.salesProductId, asset && !asset.isDeleted ? asset.id : null);
    }
    return current;
  }

  async findAssetUrl(input: { organizationId: string; assetId: string }): Promise<string | null> {
    const asset = await this.prisma.contentAsset.findFirst({
      where: { id: input.assetId, organizationId: input.organizationId, isDeleted: false },
      select: { url: true },
    });
    return asset?.url ?? null;
  }
}
