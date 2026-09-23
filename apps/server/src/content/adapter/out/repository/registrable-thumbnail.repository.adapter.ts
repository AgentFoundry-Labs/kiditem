import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  RegistrableThumbnailGenerationRow,
  RegistrableThumbnailRepositoryPort,
  RegistrableThumbnailWorkspaceRow,
} from '../../../application/port/out/repository/registrable-thumbnail.repository.port';

@Injectable()
export class RegistrableThumbnailRepositoryAdapter implements RegistrableThumbnailRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly channelListings: ChannelListingQueryPort,
  ) {}

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
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.contentWorkspace.findFirst({
        where: { id: contentWorkspaceId, organizationId, isDeleted: false, status: 'active' },
        select: { displayName: true, salesProductId: true, channelListingId: true },
      });
      if (!workspace) return null;
      if (!workspace.channelListingId) {
        return { ...workspace, listingChannelName: null };
      }

      const [listing] = await this.channelListings.readCatalogFacts(ownerTransaction(tx), {
        organizationId,
        listingIds: [workspace.channelListingId],
        channels: ['coupang'],
        activeOnly: true,
      });
      if (!listing) return null;
      return { ...workspace, listingChannelName: listing.channelName };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
