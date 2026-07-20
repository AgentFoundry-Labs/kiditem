import type {
  ContentArchiveContentType,
  ContentArchiveGenerationRow,
} from '../port/out/repository/content-archive.repository.port';
import { toDetailPageStoredJson } from './detail-page-stored.helpers';

export interface ContentArchiveListQuery {
  page?: number;
  limit?: number;
  contentType?: ContentArchiveContentType | null;
  status?: string | null;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
}

export interface ContentArchiveWorkspaceItem {
  id: string;
  ownerType: string;
  title: string;
  thumbnailUrl: string | null;
  contentWorkspaceId: string;
  sourceCandidateId: string | null;
  channelListingId: string | null;
  href: string;
  generationCount: number;
  detailPageCount: number;
  imageCount: number;
  latestGenerationId: string | null;
  latestStatus: string | null;
  latestUpdatedAt: string;
}

export interface ContentArchiveGenerationItem {
  id: string;
  contentType: ContentArchiveContentType;
  title: string;
  thumbnailUrl: string | null;
  href: string | null;
  status: string;
  templateId: string | null;
  detailPageData: Record<string, unknown> | null;
  imageUrls: string[];
  processedImages: Record<string, string>;
  errorMessage: string | null;
  contentWorkspaceId: string;
  generationGroupId: string;
  sourceCandidateId: string | null;
  detailPageArtifactId: string | null;
  detailPageRevisionId: string | null;
  detailPageRevisions: Array<{
    id: string;
    revisionType: string;
    createdAt: string;
  }>;
  sources: Array<{
    id: string;
    sourceType: string;
    sourceCandidateId: string | null;
    sourceContentGenerationId: string | null;
    contentAssetId: string | null;
    label: string | null;
  }>;
  outputAssets: Array<{
    id: string;
    url: string;
    role: string | null;
    label: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export function buildContentArchiveWorkspaces(
  rows: ContentArchiveGenerationRow[],
): ContentArchiveWorkspaceItem[] {
  const grouped = new Map<string, ContentArchiveGenerationRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.contentWorkspaceId);
    if (bucket) bucket.push(row);
    else grouped.set(row.contentWorkspaceId, [row]);
  }
  return [...grouped.values()]
    .map(contentArchiveWorkspaceFromRows)
    .sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt));
}

export function contentArchiveWorkspaceFromRows(
  rows: ContentArchiveGenerationRow[],
): ContentArchiveWorkspaceItem {
  const latest = rows[0];
  if (!latest) throw new Error('Content archive workspace requires at least one generation.');
  const workspace = latest.contentWorkspace;
  const detailPageCount = rows.filter((row) => contentType(row) === 'detail_page').length;
  const imageCount = rows.filter((row) => contentType(row) === 'image').length;
  return {
    id: workspace.id,
    ownerType: workspace.ownerType,
    title: workspace.displayName,
    thumbnailUrl: pickThumbnail(latest),
    contentWorkspaceId: workspace.id,
    sourceCandidateId: workspace.sourceCandidateId,
    channelListingId: workspace.channelListingId,
    href: `/product-pipeline/registered-products/${encodeURIComponent(workspace.id)}`,
    generationCount: rows.length,
    detailPageCount,
    imageCount,
    latestGenerationId: latest.id,
    latestStatus: latest.status,
    latestUpdatedAt: latest.updatedAt.toISOString(),
  };
}

export function contentArchiveGenerationItem(
  row: ContentArchiveGenerationRow,
): ContentArchiveGenerationItem {
  const rowContentType = contentType(row);
  const detailPageStored = rowContentType === 'detail_page'
    ? toDetailPageStoredJson({
        templateId: normalizeDetailPageTemplateId(row.templateId),
        generationInput: row.generationInput,
        generationResult: row.generationResult,
      })
    : null;
  const activeArtifact = row.detailPageArtifact?.isDeleted === false
    ? row.detailPageArtifact
    : null;
  const sourceCandidateId =
    row.sourceCandidateId ??
    row.contentWorkspace.sourceCandidateId ??
    row.sources.find((source) => source.sourceCandidateId)?.sourceCandidateId ??
    null;
  const detailPageRevisionId =
    activeArtifact?.currentRevisionId ?? activeArtifact?.currentRevision?.id ?? null;
  return {
    id: row.id,
    contentType: rowContentType,
    title: row.generatedTitle ?? (rowContentType === 'image' ? '이미지 생성 결과' : '상세페이지 결과'),
    thumbnailUrl: pickThumbnail(row),
    href: rowContentType === 'detail_page'
      ? `/product-pipeline/detail-pages/${encodeURIComponent(row.id)}/editor`
      : null,
    status: normalizeStatus(row.status),
    templateId: detailPageStored?.templateId ?? null,
    detailPageData: detailPageStored ? asPlainRecord(detailPageStored.result) : null,
    imageUrls: detailPageStored?.imageUrls ?? [],
    processedImages: detailPageStored?.processedImages ?? {},
    errorMessage: row.errorMessage,
    contentWorkspaceId: row.contentWorkspaceId,
    generationGroupId: row.generationGroupId,
    sourceCandidateId,
    detailPageArtifactId: row.detailPageArtifactId,
    detailPageRevisionId,
    detailPageRevisions: (activeArtifact?.revisions ?? []).map((revision) => ({
      id: revision.id,
      revisionType: revision.revisionType,
      createdAt: revision.createdAt.toISOString(),
    })),
    sources: row.sources.map((source) => ({ ...source })),
    outputAssets: sortedUsedAssets(row).map((asset) => ({
      id: asset.id,
      url: asset.url,
      role: asset.role,
      label: asset.label,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function contentType(row: Pick<ContentArchiveGenerationRow, 'contentType'>): ContentArchiveContentType {
  return row.contentType === 'image' ? 'image' : 'detail_page';
}

function pickThumbnail(row: ContentArchiveGenerationRow): string | null {
  const result = row.generationResult && typeof row.generationResult === 'object'
    ? row.generationResult as Record<string, unknown>
    : {};
  const input = row.generationInput && typeof row.generationInput === 'object'
    ? row.generationInput as Record<string, unknown>
    : {};
  const processed = asStringRecord(result.processedImages);
  return processed.__heroBanner ??
    sortedUsedAssets(row)[0]?.url ??
    pickFirstString(input.imageUrls);
}

function sortedUsedAssets(row: ContentArchiveGenerationRow) {
  return row.assetUsages
    .map((usage) => usage.contentAsset)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function pickFirstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  return value.find((item): item is string => typeof item === 'string') ?? null;
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeDetailPageTemplateId(value: string | null): 'kids-playful' | 'bold-vertical' {
  return value === 'bold-vertical' ? 'bold-vertical' : 'kids-playful';
}

function normalizeStatus(status: string): string {
  if (status === 'READY') return 'completed';
  if (status === 'FAILED') return 'failed';
  if (status === 'PROCESSING') return 'processing';
  if (status === 'CANCELLED') return 'cancelled';
  return status.toLowerCase();
}
