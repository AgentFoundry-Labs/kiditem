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

  async findCandidates(input: {
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
                status: 'active',
              },
            },
          },
        },
      },
      select: {
        channelListingId: true,
        channelListing: {
          select: { channelAccount: { select: { channel: true } } },
        },
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
      const channel = workspace.channelListing?.channelAccount.channel;
      if (!channel) return [];
      return workspace.contentGenerationGroups.flatMap((group) =>
        group.originatingAssets.flatMap((asset): CatalogDisplayMediaCandidate[] => {
          const metadata = record(asset.metadata);
          if (
            !isChannelCatalogMetadata(metadata, channel)
            || metadata?.active === false
            || !asset.url.trim()
            || (asset.role !== 'primary' && asset.role !== 'option')
          ) return [];
          return [{
            id: asset.id,
            channel,
            channelListingId,
            url: asset.url,
            role: asset.role,
            sortOrder: asset.sortOrder,
            externalOptionId: nonEmptyString(metadata?.externalOptionId),
          }];
        }),
      );
    });
  }
}

function isChannelCatalogMetadata(
  metadata: Record<string, unknown> | null,
  channel: string,
): boolean {
  if (metadata?.sourceType === 'coupang_catalog') return channel === 'coupang';
  return metadata?.sourceType === 'channel_catalog'
    && nonEmptyString(metadata.channel) === channel;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
