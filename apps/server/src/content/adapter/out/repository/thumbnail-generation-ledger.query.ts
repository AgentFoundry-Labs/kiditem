import type { ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import type { ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { readListingWorkspaceSources, type ListingWorkspaceSource } from './listing-workspace-context';
import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { readProductAbcPublication } from '../../../../products/adapter/out/persistence/read/product-abc-publication.reader';
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
  // The workspace's own managed gallery replaces the sourcing-candidate images
  // it used to borrow: Sourcing is no longer reachable from an AI row.
  contentGenerationGroups: {
    where: { groupType: 'workspace_assets' },
    take: 1,
    select: {
      originatingAssets: {
        where: { isDeleted: false, assetType: 'image' },
        orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
        take: 20,
        select: { url: true, role: true, sortOrder: true },
      },
    },
  },
  channelListingId: true,
  thumbnailAnalyses: {
    orderBy: { updatedAt: 'desc' as const },
    take: 1,
    select: THUMBNAIL_ANALYSIS_SELECT,
  },
} satisfies Prisma.ContentWorkspaceSelect;

type WorkspaceContextRow = Prisma.ContentWorkspaceGetPayload<{
  select: typeof workspaceContextSelect;
}> & { channelListing: ListingWorkspaceSource | null };

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
    workspace.channelListing?.displayName ||
    workspace.channelListing?.channelName ||
    workspace.channelListing?.externalId ||
    ''
  );
}

function workspaceAssets(workspace: WorkspaceContextRow): Array<{
  url: string;
  role: string;
  sortOrder: number;
  isPrimary: boolean;
}> {
  return (workspace.contentGenerationGroups[0]?.originatingAssets ?? []).map((asset, index) => ({
    url: asset.url,
    role: asset.role ?? 'product',
    sortOrder: asset.sortOrder,
    isPrimary: index === 0,
  }));
}

function workspaceImageUrl(workspace: WorkspaceContextRow): string | null {
  return (
    workspace.currentThumbnailSelection?.contentAsset.url ??
    workspaceAssets(workspace)[0]?.url ??
    workspace.channelListing?.thumbnails[0]?.imageUrl ??
    null
  );
}

function toThumbnailJobWorkspace(workspace: WorkspaceContextRow): ThumbnailJobWorkspaceRow {
  const selectedUrl = workspace.currentThumbnailSelection?.contentAsset.url;
  const images = selectedUrl
    ? [{ url: selectedUrl, role: 'thumbnail', sortOrder: 0, isPrimary: true }]
    : workspaceAssets(workspace);
  const imageUrl = workspaceImageUrl(workspace);
  return {
    id: workspace.id,
    name: workspaceName(workspace),
    imageUrl,
    thumbnailUrl: imageUrl,
    category: workspace.channelListing?.category ?? null,
    images,
    thumbnailAnalyses: workspace.thumbnailAnalyses as unknown as ThumbnailAnalysisContext[],
  };
}

async function findWorkspaceContexts(
  prisma: PrismaService,
  ids: string[],
  organizationId: string,
  listings: ChannelListingQueryPort,
): Promise<WorkspaceContextRow[]> {
  if (ids.length === 0) return [];
  return prisma.$transaction(async tx => {
  const rows = await tx.contentWorkspace.findMany({
    where: {
      id: { in: ids },
      organizationId,
      status: 'active',
      isDeleted: false,
    },
    select: workspaceContextSelect,
  });
  const sources = await readListingWorkspaceSources(tx, listings, organizationId, rows.flatMap(row => row.channelListingId ? [row.channelListingId] : []));
  return rows.map(row => ({ ...row, channelListing: row.channelListingId ? sources.get(row.channelListingId) ?? null : null }));
  });
}

export async function findWorkspaceForThumbnailEditor(
  prisma: PrismaService,
  contentWorkspaceId: string,
  organizationId: string,
  listings: ChannelListingQueryPort,
): Promise<EditorProductRow | null> {
  const workspace = (await findWorkspaceContexts(prisma, [contentWorkspaceId], organizationId, listings))[0];
  if (!workspace) return null;
  return {
    id: workspace.id,
    name: workspaceName(workspace),
    imageUrl: workspaceImageUrl(workspace),
    category: workspace.channelListing?.category ?? null,
    organizationId: workspace.organizationId,
  };
}

export async function findGenerationWorkspaces(
  prisma: PrismaService,
  rows: Array<{ contentWorkspaceId: string | null }>,
  organizationId: string,
  listings: ChannelListingQueryPort,
): Promise<Map<string, GenerationWorkspaceSummary>> {
  const ids = [...new Set(rows.map((row) => row.contentWorkspaceId).filter((id): id is string => Boolean(id)))];
  const workspaces = await findWorkspaceContexts(prisma, ids, organizationId, listings);
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
  listings: ChannelListingQueryPort,
): Promise<GenerationWorkspaceSummary | null> {
  if (!contentWorkspaceId) return null;
  return (
    (await findGenerationWorkspaces(prisma, [{ contentWorkspaceId }], organizationId, listings)).get(contentWorkspaceId) ?? null
  );
}

export async function findWorkspaceForThumbnailJob(
  prisma: PrismaService,
  contentWorkspaceId: string,
  organizationId: string,
  listings: ChannelListingQueryPort,
): Promise<ThumbnailJobWorkspaceRow | null> {
  const workspace = (await findWorkspaceContexts(prisma, [contentWorkspaceId], organizationId, listings))[0];
  return workspace ? toThumbnailJobWorkspace(workspace) : null;
}

export async function findWorkspacesForThumbnailJobs(
  prisma: PrismaService,
  ids: string[],
  organizationId: string,
  listings: ChannelListingQueryPort,
): Promise<Map<string, ThumbnailJobWorkspaceRow>> {
  const workspaces = await findWorkspaceContexts(prisma, ids, organizationId, listings);
  return new Map(workspaces.map((workspace) => [workspace.id, toThumbnailJobWorkspace(workspace)]));
}

export async function findGenerationRows(
  prisma: PrismaService,
  organizationId: string,
  opts: {
    contentWorkspaceId?: string | null;
    scope?: ThumbnailGenerationListScope;
    limit?: number | null;
  } = {},
): Promise<GenerationRow[]> {
  const limit = opts.limit ? Math.min(Math.max(opts.limit, 1), 100) : undefined;
  const ownerFilter: Prisma.ThumbnailGenerationWhereInput = opts.contentWorkspaceId
    ? { contentWorkspaceId: opts.contentWorkspaceId }
    : opts.scope === 'all'
      ? {}
      : opts.scope === 'direct-upload'
        ? { contentWorkspace: { is: { ownerType: 'direct_detail_page' } } }
        : { contentWorkspace: { is: { ownerType: { not: 'direct_detail_page' } } } };
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
  listings: ChannelListingQueryPort,
  recipes: ChannelOptionRecipePort,
): Promise<Array<{ id: string }>> {
  return prisma.$transaction(
    (tx) => findAutoBatchCandidatesSnapshot(tx, organizationId, take, listings, recipes),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

async function findAutoBatchCandidatesSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  take: number,
  listings: ChannelListingQueryPort,
  recipes: ChannelOptionRecipePort,
): Promise<Array<{ id: string }>> {
  const publication = await readProductAbcPublication(tx, { organizationId });
  const aGradeProductIds = publication.products.flatMap((product) =>
    product.evaluation?.abcGrade === 'A' ? [product.masterProductId] : []);
  if (aGradeProductIds.length === 0) return [];
  const candidateListings = await recipes.findListingsBySourceProducts(ownerTransaction(tx), { organizationId, masterProductIds: aGradeProductIds, activeOnly: true });
  const aGradeIds = new Set(aGradeProductIds);
  const listingIds = candidateListings.filter(row => row.masterProductId !== null && aGradeIds.has(row.masterProductId)).map(row => row.listingId);
  if (listingIds.length === 0) return [];
  const rows = await tx.contentWorkspace.findMany({
    where: {
      organizationId,
      status: 'active',
      isDeleted: false,
      channelListingId: { in: listingIds },
    },
    select: workspaceContextSelect,
    orderBy: { updatedAt: 'desc' },
    take,
  });
  const sources = await readListingWorkspaceSources(tx, listings, organizationId, listingIds);
  return rows.map(row => ({ ...row, channelListing: row.channelListingId ? sources.get(row.channelListingId) ?? null : null }))
    .filter((workspace) => Boolean(workspaceImageUrl(workspace)))
    .map((workspace) => ({ id: workspace.id }));
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
