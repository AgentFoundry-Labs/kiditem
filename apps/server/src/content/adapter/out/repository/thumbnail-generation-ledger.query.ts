import type { ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import type { ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { readListingWorkspaceSources, type ListingWorkspaceSource } from './listing-workspace-context';
import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { readProductAbcPublication } from '../../../../products/adapter/out/persistence/read/product-abc-publication.reader';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ThumbnailGenerationListScope } from '../../../domain/thumbnail-generation-subject';
import type {
  ThumbnailGenerationWorkspaceSummary as GenerationWorkspaceSummary,
  ThumbnailJobRow,
} from '../../../application/port/out/repository/thumbnail-generation-ledger.repository.port';
import { thumbnailJobSelect } from './thumbnail-generation-ledger.persistence';

const workspaceContextSelect = {
  id: true,
  organizationId: true,
  normalizedTitle: true,
  currentThumbnailAsset: { select: { url: true, isDeleted: true } },
  // The workspace's own managed images replace the sourcing-candidate images
  // it used to borrow: Sourcing is no longer reachable from an AI row. AI
  // candidates that were not adopted are not source photos.
  assets: {
    where: { isDeleted: false, assetType: 'image', source: { in: ['upload', 'catalog'] } },
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    take: 20,
    select: { url: true, role: true, sortOrder: true },
  },
  channelListingId: true,
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
}

export type EditorProductRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
  organizationId: string;
};

/**
 * 목록 · 프롬프트에 쓰는 작업공간 이름. 직접 작업공간은 제목, 리스팅 작업공간은 몰이 보여주는 이름이다.
 * 판매 상품 작업공간은 이름을 갖지 않는다 — 호출자가 요청의 상품명을 쓴다(AI 는 Channels 행으로 이름을 채우지 않는다).
 */
function workspaceName(workspace: WorkspaceContextRow): string {
  return (
    workspace.channelListing?.displayName ||
    workspace.channelListing?.displayName ||
    workspace.channelListing?.channelName ||
    workspace.channelListing?.externalId ||
    (workspace.normalizedTitle?.startsWith('standalone-thumbnail-') ? '' : workspace.normalizedTitle) ||
    ''
  );
}

function workspaceAssets(workspace: WorkspaceContextRow): Array<{
  url: string;
  role: string;
  sortOrder: number;
  isPrimary: boolean;
}> {
  return workspace.assets.map((asset, index) => ({
    url: asset.url,
    role: asset.role ?? 'product',
    sortOrder: asset.sortOrder,
    isPrimary: index === 0,
  }));
}

function currentThumbnailUrl(workspace: WorkspaceContextRow): string | null {
  const asset = workspace.currentThumbnailAsset;
  return asset && !asset.isDeleted ? asset.url : null;
}

function workspaceImageUrl(workspace: WorkspaceContextRow): string | null {
  return (
    currentThumbnailUrl(workspace) ??
    workspaceAssets(workspace)[0]?.url ??
    workspace.channelListing?.thumbnails[0]?.imageUrl ??
    null
  );
}

function toThumbnailJobWorkspace(workspace: WorkspaceContextRow): ThumbnailJobWorkspaceRow {
  const selectedUrl = currentThumbnailUrl(workspace);
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
): Promise<ThumbnailJobRow[]> {
  const limit = opts.limit ? Math.min(Math.max(opts.limit, 1), 100) : undefined;
  const ownerFilter: Prisma.ThumbnailGenerationWhereInput = opts.contentWorkspaceId
    ? { contentWorkspaceId: opts.contentWorkspaceId }
    : opts.scope === 'all'
      ? {}
      : opts.scope === 'direct-upload'
        ? { contentWorkspace: { is: { ownerType: 'direct_detail_page' } } }
        : { contentWorkspace: { is: { ownerType: { not: 'direct_detail_page' } } } };
  return prisma.thumbnailGeneration.findMany({
    where: { organizationId, isDeleted: false, ...ownerFilter },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
    select: thumbnailJobSelect,
  });
}

export async function findGenerationOrThrow(
  prisma: PrismaService,
  id: string,
  organizationId: string,
): Promise<ThumbnailJobRow> {
  const row = await prisma.thumbnailGeneration.findFirst({
    where: { id, organizationId, isDeleted: false },
    select: thumbnailJobSelect,
  });
  if (!row) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  return row;
}

export function findActiveJobForWorkspace(
  prisma: PrismaService,
  contentWorkspaceId: string,
  organizationId: string,
  method: string,
): Promise<ThumbnailJobRow | null> {
  return prisma.thumbnailGeneration.findFirst({
    where: {
      contentWorkspaceId,
      organizationId,
      isDeleted: false,
      method,
      status: { in: ['pending', 'running'] },
    },
    select: thumbnailJobSelect,
  });
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
