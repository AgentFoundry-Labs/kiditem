import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { readListingWorkspaceSources, type ListingWorkspaceSource } from './listing-workspace-context';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type ThumbnailAnalysisRepositoryPort,
  type ThumbnailAnalysisWorkspaceRow,
  type UpsertThumbnailAnalysisInput,
} from '../../../application/port/out/repository/thumbnail-analysis.repository.port';
import { upsertThumbnailAnalysis } from './thumbnail-analysis.persistence';
import type { Prisma } from '@prisma/client';

const THUMBNAIL_ANALYSIS_CHANNEL = 'coupang';

const workspaceSelect = {
  id: true,
  displayName: true,
  createdAt: true,
  currentThumbnailSelection: {
    select: { contentAsset: { select: { url: true } } },
  },
  // The workspace's own managed gallery replaces the sourcing-candidate images
  // it used to borrow: Sourcing is no longer reachable from an AI row.
  contentGenerationGroups: {
    where: { groupType: 'workspace_assets' },
    take: 1,
    select: {
      originatingAssets: {
        where: { isDeleted: false, assetType: 'image' },
        orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
        take: 1,
        select: { url: true },
      },
    },
  },
  channelListingId: true,
} satisfies Prisma.ContentWorkspaceSelect;

type WorkspaceSourceRow = Prisma.ContentWorkspaceGetPayload<{
  select: typeof workspaceSelect;
}> & { channelListing: ListingWorkspaceSource | null };

function toWorkspaceRow(row: WorkspaceSourceRow): ThumbnailAnalysisWorkspaceRow | null {
  const imageUrl =
    row.currentThumbnailSelection?.contentAsset.url ??
    row.contentGenerationGroups[0]?.originatingAssets[0]?.url ??
    row.channelListing?.thumbnails[0]?.imageUrl ??
    null;
  if (!imageUrl) return null;
  return {
    id: row.id,
    name:
      row.displayName ??
      row.channelListing?.displayName ??
      row.channelListing?.channelName ??
      row.channelListing?.externalId ??
      '',
    imageUrl,
    category: row.channelListing?.category ?? null,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class ThumbnailAnalysisRepositoryAdapter
  implements ThumbnailAnalysisRepositoryPort
{
  constructor(private readonly prisma: PrismaService, @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly listings: ChannelListingQueryPort) {}

  private async listWorkspaceRows(
    organizationId: string,
    ids?: string[],
  ): Promise<ThumbnailAnalysisWorkspaceRow[]> {
    return this.prisma.$transaction(async tx => {
    const listings = await this.listings.readCatalogFacts(ownerTransaction(tx), { organizationId, channels: [THUMBNAIL_ANALYSIS_CHANNEL], activeOnly: true });
    if (listings.length === 0) return [];
    const rows = await tx.contentWorkspace.findMany({
      where: {
        organizationId,
        ownerType: 'channel_listing',
        status: 'active',
        isDeleted: false,
        channelListingId: { in: listings.map(row => row.id) },
        ...(ids ? { id: { in: ids } } : {}),
      },
      select: workspaceSelect,
      orderBy: { createdAt: 'desc' },
    });
    const sources = await readListingWorkspaceSources(tx, this.listings, organizationId, rows.flatMap(row => row.channelListingId ? [row.channelListingId] : []));
    return rows
      .map(row => toWorkspaceRow({ ...row, channelListing: row.channelListingId ? sources.get(row.channelListingId) ?? null : null }))
      .filter((row): row is ThumbnailAnalysisWorkspaceRow => row !== null);
    });
  }

  findAllAnalysisWorkspaces(organizationId: string) {
    return this.listWorkspaceRows(organizationId);
  }

  findAnalysesForOrganization(organizationId: string) {
    return this.prisma.thumbnailAnalysis.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAnalysisSummaryRows(organizationId: string) {
    const workspaces = await this.listWorkspaceRows(organizationId);
    if (workspaces.length === 0) return { workspaceCount: 0, rows: [] };
    const rows = await this.prisma.thumbnailAnalysis.findMany({
      where: {
        organizationId,
        contentWorkspaceId: { in: workspaces.map((workspace) => workspace.id) },
      },
      select: {
        grade: true,
        complianceGrade: true,
        qualityAnalyzedAt: true,
        complianceAnalyzedAt: true,
      },
    });
    return { workspaceCount: workspaces.length, rows };
  }

  async findWorkspaceForAnalysis(contentWorkspaceId: string, organizationId: string) {
    return (await this.listWorkspaceRows(organizationId, [contentWorkspaceId]))[0] ?? null;
  }

  findWorkspacesForBatch(contentWorkspaceIds: string[], organizationId: string) {
    return this.listWorkspaceRows(organizationId, contentWorkspaceIds);
  }

  findWorkspacesForPreInspect(
    contentWorkspaceIds: string[] | undefined,
    organizationId: string,
  ) {
    return this.listWorkspaceRows(organizationId, contentWorkspaceIds);
  }

  upsertAnalysis(input: UpsertThumbnailAnalysisInput) {
    return upsertThumbnailAnalysis(this.prisma, input);
  }

  async findRecomposeWorkspace(contentWorkspaceId: string, organizationId: string) {
    return (await this.listWorkspaceRows(organizationId, [contentWorkspaceId]))[0] ?? null;
  }
}
