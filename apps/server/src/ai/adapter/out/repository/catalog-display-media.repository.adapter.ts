import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CatalogDisplayMediaCandidate,
  CatalogDisplayMediaRepositoryPort,
} from '../../../application/port/out/repository/catalog-display-media.repository.port';

@Injectable()
export class CatalogDisplayMediaRepositoryAdapter
  implements CatalogDisplayMediaRepositoryPort
{
  constructor(private readonly prisma: PrismaService, @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly listings: ChannelListingQueryPort) {}

  async findCandidates(input: {
    organizationId: string;
    channelListingIds: string[];
  }): Promise<CatalogDisplayMediaCandidate[]> {
    const channelListingIds = [...new Set(input.channelListingIds)];
    if (channelListingIds.length === 0) return [];

    return this.prisma.$transaction(async tx => {
    const facts = await this.listings.readCatalogFacts(ownerTransaction(tx), { organizationId: input.organizationId, listingIds: channelListingIds, activeOnly: true, activeAccountsOnly: true });
    const channelByListing = new Map(facts.map(row => [row.id, row.channel]));
    if (facts.length === 0) return [];
    const workspaces = await tx.contentWorkspace.findMany({
      where: {
        organizationId: input.organizationId,
        ownerType: 'channel_listing',
        status: 'active',
        isDeleted: false,
        channelListingId: { in: facts.map(row => row.id) },
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
      const channel = channelByListing.get(channelListingId);
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
          const role: 'primary' | 'option' = asset.role === 'primary' ? 'primary' : 'option';
          const optionIds = role === 'option'
            ? optionIdsFromMetadata(metadata)
            : [];
          const candidate = {
            id: asset.id,
            channel,
            channelListingId,
            url: asset.url,
            role,
            sortOrder: asset.sortOrder,
            externalOptionId: optionIds.length === 1 ? optionIds[0]! : null,
            ...(role === 'option' ? { externalOptionIds: optionIds } : {}),
          };
          return [candidate];
        }),
      );
    });
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

function optionIdsFromMetadata(metadata: Record<string, unknown> | null): string[] {
  const arrayValue = Array.isArray(metadata?.externalOptionIds)
    ? metadata.externalOptionIds
    : [];
  const ids = [...new Set([
    ...arrayValue,
    metadata?.externalOptionId,
  ].filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
  return ids;
}
