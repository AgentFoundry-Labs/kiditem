import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CatalogDisplayMediaCandidate,
  CatalogDisplayMediaRepositoryPort,
} from '../../../application/port/out/repository/catalog-display-media.repository.port';

@Injectable()
export class CatalogDisplayMediaRepositoryAdapter
  implements CatalogDisplayMediaRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findCoupangCandidates(input: {
    organizationId: string;
    channelListingIds: string[];
  }): Promise<CatalogDisplayMediaCandidate[]> {
    const channelListingIds = [...new Set(input.channelListingIds)];
    if (channelListingIds.length === 0) return [];

    const workspaces = await this.prisma.contentWorkspace.findMany({
      where: {
        organizationId: input.organizationId,
        ownerType: 'channel_listing',
        status: 'active',
        isDeleted: false,
        channelListingId: { in: channelListingIds },
        channelListing: {
          is: {
            organizationId: input.organizationId,
            isActive: true,
            channelAccount: {
              is: {
                organizationId: input.organizationId,
                channel: 'coupang',
                status: 'active',
              },
            },
          },
        },
      },
      select: {
        channelListingId: true,
        contentGenerationGroups: {
          where: {
            organizationId: input.organizationId,
            groupType: 'workspace_assets',
          },
          select: {
            originatingAssets: {
              where: {
                organizationId: input.organizationId,
                assetType: 'image',
                role: { in: ['primary', 'option'] },
                isDeleted: false,
              },
              select: {
                id: true,
                url: true,
                role: true,
                sortOrder: true,
                metadata: true,
              },
            },
          },
        },
      },
    });

    return workspaces.flatMap((workspace) => {
      const channelListingId = workspace.channelListingId;
      if (!channelListingId) return [];
      return workspace.contentGenerationGroups.flatMap((group) =>
        group.originatingAssets.flatMap((asset): CatalogDisplayMediaCandidate[] => {
          const metadata = record(asset.metadata);
          if (
            metadata?.sourceType !== 'coupang_catalog'
            || metadata.active === false
            || !asset.url.trim()
            || (asset.role !== 'primary' && asset.role !== 'option')
          ) return [];
          return [{
            id: asset.id,
            channelListingId,
            url: asset.url,
            role: asset.role,
            sortOrder: asset.sortOrder,
            externalOptionId: nonEmptyString(metadata.externalOptionId),
          }];
        }),
      );
    });
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
