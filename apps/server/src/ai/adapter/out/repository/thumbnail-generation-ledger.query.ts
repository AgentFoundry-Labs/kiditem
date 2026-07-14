import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { GenerationWorkspaceSummary, GenerationRow } from '../../../mapper/thumbnail-generation.mapper';
import type { ThumbnailGenerationListScope } from '../../../domain/thumbnail-generation-subject';
import type { ThumbnailAnalysisContext } from '../../../domain/thumbnail-generation-inputs';

export const THUMBNAIL_ANALYSIS_SELECT = {
  recompose: true,
  complianceGrade: true,
  complianceScores: true,
  overallScore: true,
  grade: true,
  qualityAnalyzedAt: true,
  complianceAnalyzedAt: true,
} satisfies Prisma.ThumbnailAnalysisSelect;

export function generationInclude(organizationId: string): Prisma.ThumbnailGenerationInclude {
  return {
    candidates: {
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    },
    registrationAttempts: {
      where: { organizationId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 1,
    },
  };
}

export function inputImagesInclude(organizationId: string): Prisma.ThumbnailGeneration$inputImagesArgs {
  return {
    where: { organizationId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  };
}

export function candidatesInclude(organizationId: string): Prisma.ThumbnailGeneration$candidatesArgs {
  return {
    where: { organizationId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  };
}

const workspaceContextSelect = {
  id: true,
  organizationId: true,
  displayName: true,
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
        select: {
          url: true,
          role: true,
          sortOrder: true,
          isPrimary: true,
        },
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
  thumbnailAnalyses: {
    orderBy: { updatedAt: 'desc' as const },
    take: 1,
    select: THUMBNAIL_ANALYSIS_SELECT,
  },
} satisfies Prisma.ContentWorkspaceSelect;

type WorkspaceContextRow = Prisma.ContentWorkspaceGetPayload<{
  select: typeof workspaceContextSelect;
}>;

export interface ThumbnailJobWorkspaceRow {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  category: string | null;
  images: Array<{
    url: string;
    role: string;
    sortOrder: number;
    isPrimary: boolean;
  }>;
  thumbnailAnalyses: ThumbnailAnalysisContext[];
}

export type EditorProductRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
  organizationId: string;
};

function workspaceName(workspace: WorkspaceContextRow): string {
  return (
    workspace.displayName ||
    workspace.sourceCandidate?.name ||
    workspace.channelListing?.displayName ||
    workspace.channelListing?.channelName ||
    workspace.channelListing?.externalId ||
    ''
  );
}

function workspaceImageUrl(workspace: WorkspaceContextRow): string | null {
  return (
    workspace.currentThumbnailSelection?.contentAsset.url ??
    workspace.sourceCandidate?.thumbnailUrl ??
    workspace.sourceCandidate?.imageUrl ??
    workspace.sourceCandidate?.images[0]?.url ??
    workspace.channelListing?.thumbnails[0]?.imageUrl ??
    null
  );
}

function toThumbnailJobWorkspace(workspace: WorkspaceContextRow): ThumbnailJobWorkspaceRow {
  const selectedUrl = workspace.currentThumbnailSelection?.contentAsset.url;
  const images = selectedUrl
    ? [{ url: selectedUrl, role: 'thumbnail', sortOrder: 0, isPrimary: true }]
    : (workspace.sourceCandidate?.images ?? []);
  const imageUrl = workspaceImageUrl(workspace);
  return {
    id: workspace.id,
    name: workspaceName(workspace),
    imageUrl,
    thumbnailUrl: imageUrl,
    category: workspace.sourceCandidate?.category ?? workspace.channelListing?.category ?? null,
    images,
    thumbnailAnalyses: workspace.thumbnailAnalyses as unknown as ThumbnailAnalysisContext[],
  };
}

async function findWorkspaceContexts(
  prisma: PrismaService,
  ids: string[],
  organizationId: string,
): Promise<WorkspaceContextRow[]> {
  if (ids.length === 0) return [];
  return prisma.contentWorkspace.findMany({
    where: {
      id: { in: ids },
      organizationId,
      status: 'active',
      isDeleted: false,
    },
    select: workspaceContextSelect,
  });
}

export async function findWorkspaceForThumbnailEditor(
  prisma: PrismaService,
  contentWorkspaceId: string,
  organizationId: string,
): Promise<EditorProductRow | null> {
  const workspace = (await findWorkspaceContexts(prisma, [contentWorkspaceId], organizationId))[0];
  if (!workspace) return null;
  return {
    id: workspace.id,
    name: workspaceName(workspace),
    imageUrl: workspaceImageUrl(workspace),
    category: workspace.sourceCandidate?.category ?? workspace.channelListing?.category ?? null,
    organizationId: workspace.organizationId,
  };
}

export async function findGenerationWorkspaces(
  prisma: PrismaService,
  rows: Array<{ contentWorkspaceId: string | null }>,
  organizationId: string,
): Promise<Map<string, GenerationWorkspaceSummary>> {
  const ids = [...new Set(rows.map((row) => row.contentWorkspaceId).filter((id): id is string => Boolean(id)))];
  const workspaces = await findWorkspaceContexts(prisma, ids, organizationId);
  return new Map(
    workspaces.map((workspace) => {
      const job = toThumbnailJobWorkspace(workspace);
      return [
        workspace.id,
        {
          id: job.id,
          name: job.name,
          imageUrl: job.imageUrl,
          category: job.category,
        },
      ];
    }),
  );
}

export async function findGenerationWorkspace(
  prisma: PrismaService,
  contentWorkspaceId: string | null,
  organizationId: string,
): Promise<GenerationWorkspaceSummary | null> {
  if (!contentWorkspaceId) return null;
  return (
    (await findGenerationWorkspaces(prisma, [{ contentWorkspaceId }], organizationId)).get(contentWorkspaceId) ?? null
  );
}

export async function findWorkspaceForThumbnailJob(
  prisma: PrismaService,
  contentWorkspaceId: string,
  organizationId: string,
): Promise<ThumbnailJobWorkspaceRow | null> {
  const workspace = (await findWorkspaceContexts(prisma, [contentWorkspaceId], organizationId))[0];
  return workspace ? toThumbnailJobWorkspace(workspace) : null;
}

export async function findWorkspacesForThumbnailJobs(
  prisma: PrismaService,
  ids: string[],
  organizationId: string,
): Promise<Map<string, ThumbnailJobWorkspaceRow>> {
  const workspaces = await findWorkspaceContexts(prisma, ids, organizationId);
  return new Map(workspaces.map((workspace) => [workspace.id, toThumbnailJobWorkspace(workspace)]));
}

export async function findGenerationRows(
  prisma: PrismaService,
  organizationId: string,
  opts: {
    sourceCandidateId?: string | null;
    contentWorkspaceId?: string | null;
    scope?: ThumbnailGenerationListScope;
    limit?: number | null;
  } = {},
): Promise<GenerationRow[]> {
  const limit = opts.limit ? Math.min(Math.max(opts.limit, 1), 100) : undefined;
  const ownerFilter: Prisma.ThumbnailGenerationWhereInput = opts.contentWorkspaceId
    ? { contentWorkspaceId: opts.contentWorkspaceId }
    : opts.sourceCandidateId
      ? { sourceCandidateId: opts.sourceCandidateId }
      : opts.scope === 'all'
        ? {}
        : opts.scope === 'direct-upload'
          ? { contentWorkspace: { is: { ownerType: 'direct_detail_page' } } }
          : { contentWorkspace: { is: { channelListingId: { not: null } } } };
  const rows = await prisma.thumbnailGeneration.findMany({
    where: { organizationId, isDeleted: false, ...ownerFilter },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
    include: generationInclude(organizationId),
  });
  return rows as unknown as GenerationRow[];
}

export async function findGenerationOrThrow(
  prisma: PrismaService,
  id: string,
  organizationId: string,
): Promise<GenerationRow> {
  const row = await prisma.thumbnailGeneration.findFirst({
    where: { id, organizationId, isDeleted: false },
    include: generationInclude(organizationId),
  });
  if (!row) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  return row as unknown as GenerationRow;
}

export async function findGenerationWithCandidatesOrThrow(prisma: PrismaService, id: string, organizationId: string) {
  const row = await prisma.thumbnailGeneration.findFirst({
    where: { id, organizationId, isDeleted: false },
    include: { candidates: candidatesInclude(organizationId) },
  });
  if (!row) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  return row;
}

export async function findGenerationWithInputImages(prisma: PrismaService, id: string, organizationId: string) {
  const row = await prisma.thumbnailGeneration.findFirst({
    where: { id, organizationId, isDeleted: false },
    include: { inputImages: inputImagesInclude(organizationId) },
  });
  return row;
}

export async function findActiveJobForWorkspace(
  prisma: PrismaService,
  contentWorkspaceId: string,
  organizationId: string,
  method: string,
): Promise<GenerationRow | null> {
  const row = await prisma.thumbnailGeneration.findFirst({
    where: {
      contentWorkspaceId: contentWorkspaceId,
      organizationId,
      isDeleted: false,
      method,
      status: { in: ['pending', 'running'] },
    },
    include: generationInclude(organizationId),
  });
  return row as unknown as GenerationRow | null;
}

export function findRecentAutoJob(
  prisma: PrismaService,
  contentWorkspaceId: string,
  organizationId: string,
  cooldownStart: Date,
): Promise<{ id: string } | null> {
  return prisma.thumbnailGeneration.findFirst({
    where: {
      organizationId,
      contentWorkspaceId: contentWorkspaceId,
      isDeleted: false,
      method: 'auto',
      createdAt: { gte: cooldownStart },
    },
    select: { id: true },
  });
}

export async function findAutoBatchCandidates(
  prisma: PrismaService,
  organizationId: string,
  take: number,
): Promise<Array<{ id: string }>> {
  const rows = await prisma.contentWorkspace.findMany({
    where: {
      organizationId,
      status: 'active',
      isDeleted: false,
      channelListing: { is: { isActive: true, abcGrade: 'A' } },
    },
    select: workspaceContextSelect,
    orderBy: { updatedAt: 'desc' },
    take,
  });
  return rows.filter((workspace) => Boolean(workspaceImageUrl(workspace))).map((workspace) => ({ id: workspace.id }));
}

export function findThumbnailAnalysisGrade(
  prisma: PrismaService,
  contentWorkspaceId: string,
  organizationId: string,
): Promise<{ grade: string; overallScore: number } | null> {
  return prisma.thumbnailAnalysis.findFirst({
    where: { contentWorkspaceId: contentWorkspaceId, organizationId },
    select: { grade: true, overallScore: true },
  });
}
