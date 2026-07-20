import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type ThumbnailAnalysisRepositoryPort,
  type ThumbnailAnalysisWorkspaceRow,
  type UpsertThumbnailAnalysisInput,
} from '../../../application/port/out/repository/thumbnail-analysis.repository.port';
import { upsertThumbnailAnalysis } from './thumbnail-analysis.persistence';

const workspaceSelect = {
  id: true,
  displayName: true,
  createdAt: true,
  currentThumbnailSelection: {
    select: { contentAsset: { select: { url: true } } },
  },
  sourceCandidate: {
    select: {
      name: true,
      category: true,
      imageUrl: true,
      thumbnailUrl: true,
      images: {
        where: { isDeleted: false },
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
        take: 1,
        select: { url: true },
      },
    },
  },
  channelListing: {
    select: {
      displayName: true,
      channelName: true,
      externalId: true,
      category: true,
      thumbnails: {
        where: { status: 'active' },
        orderBy: { updatedAt: 'desc' as const },
        take: 1,
        select: { imageUrl: true },
      },
    },
  },
} satisfies Prisma.ContentWorkspaceSelect;

type WorkspaceSourceRow = Prisma.ContentWorkspaceGetPayload<{
  select: typeof workspaceSelect;
}>;

function toWorkspaceRow(row: WorkspaceSourceRow): ThumbnailAnalysisWorkspaceRow | null {
  const imageUrl =
    row.currentThumbnailSelection?.contentAsset.url ??
    row.sourceCandidate?.thumbnailUrl ??
    row.sourceCandidate?.imageUrl ??
    row.sourceCandidate?.images[0]?.url ??
    row.channelListing?.thumbnails[0]?.imageUrl ??
    null;
  if (!imageUrl) return null;
  return {
    id: row.id,
    name:
      row.displayName ??
      row.sourceCandidate?.name ??
      row.channelListing?.displayName ??
      row.channelListing?.channelName ??
      row.channelListing?.externalId ??
      '',
    imageUrl,
    category: row.sourceCandidate?.category ?? row.channelListing?.category ?? null,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class ThumbnailAnalysisRepositoryAdapter
  implements ThumbnailAnalysisRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  private async listWorkspaceRows(
    organizationId: string,
    ids?: string[],
  ): Promise<ThumbnailAnalysisWorkspaceRow[]> {
    const rows = await this.prisma.contentWorkspace.findMany({
      where: {
        organizationId,
        status: 'active',
        isDeleted: false,
        ...(ids ? { id: { in: ids } } : {}),
      },
      select: workspaceSelect,
      orderBy: { createdAt: 'desc' },
    });
    return rows
      .map(toWorkspaceRow)
      .filter((row): row is ThumbnailAnalysisWorkspaceRow => row !== null);
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
