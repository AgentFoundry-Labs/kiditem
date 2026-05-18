import type {
  ContentArchiveContentType,
  ContentArchiveGenerationRow,
  ContentArchiveLinkState,
  ContentArchiveProductRow,
} from '../port/out/content-archive.repository.port';
import { toDetailPageStoredJson } from './detail-page-stored.helpers';

export type WorkspaceType = 'product' | 'unlinked_group';

export interface ContentArchiveListQuery {
  page?: number;
  limit?: number;
  contentType?: ContentArchiveContentType | null;
  linkState?: ContentArchiveLinkState | null;
  status?: string | null;
  sourceCandidateId?: string | null;
  productId?: string | null;
}

export interface ProductContentWorkspaceItem {
  id: string;
  workspaceType: WorkspaceType;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  productId: string | null;
  product: { id: string; code: string; name: string } | null;
  generationGroupId: string | null;
  href: string;
  generationCount: number;
  detailPageCount: number;
  imageCount: number;
  latestGenerationId: string | null;
  latestStatus: string | null;
  latestUpdatedAt: string;
}

export interface ProductContentGenerationItem {
  id: string;
  contentType: ContentArchiveContentType;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  href: string | null;
  status: string;
  templateId: string | null;
  detailPageData: Record<string, unknown> | null;
  imageUrls: string[];
  processedImages: Record<string, string>;
  errorMessage: string | null;
  productId: string | null;
  generationGroupId: string | null;
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
  outputAssets: Array<{ id: string; url: string; role: string | null; label: string | null }>;
  createdAt: string;
  updatedAt: string;
}

export function buildContentArchiveWorkspaces(
  rows: ContentArchiveGenerationRow[],
): ProductContentWorkspaceItem[] {
  const grouped = new Map<string, ContentArchiveGenerationRow[]>();
  for (const row of rows) {
    const productId = row.generationGroup.targetMasterId;
    const key = productId
      ? `product:${productId}`
      : `group:${row.generationGroupId}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return [...grouped.entries()]
    .map(([key, groupRows]) => contentArchiveWorkspaceFromRows({
      workspaceType: key.startsWith('product:') ? 'product' : 'unlinked_group',
      key: key.slice(key.indexOf(':') + 1),
      rows: groupRows,
    }))
    .sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt));
}

export function contentArchiveWorkspaceFromRows(input: {
  workspaceType: WorkspaceType;
  key: string;
  rows: ContentArchiveGenerationRow[];
  fallbackProduct?: ContentArchiveProductRow;
}): ProductContentWorkspaceItem {
  const latest = input.rows[0] ?? null;
  const product = latest?.generationGroup.targetMaster ?? input.fallbackProduct ?? null;
  const detailPageCount = input.rows.filter((row) => contentType(row) === 'detail_page').length;
  const imageCount = input.rows.filter((row) => contentType(row) === 'image').length;
  if (input.workspaceType === 'product') {
    const productId = product?.id ?? input.key;
    return {
      id: `product:${productId}`,
      workspaceType: 'product',
      title: product?.name ?? latest?.generatedTitle ?? '상품 콘텐츠',
      subtitle: `상세페이지 ${detailPageCount}개 · 이미지 ${imageCount}개`,
      thumbnailUrl: latest ? pickThumbnail(latest) ?? product?.thumbnailUrl ?? product?.imageUrl ?? null : product?.thumbnailUrl ?? product?.imageUrl ?? null,
      productId,
      product: product ? { id: product.id, code: product.code, name: product.name } : null,
      generationGroupId: null,
      href: `/product-pipeline/registered-products?masterId=${encodeURIComponent(productId)}`,
      generationCount: input.rows.length,
      detailPageCount,
      imageCount,
      latestGenerationId: latest?.id ?? null,
      latestStatus: latest?.status ?? null,
      latestUpdatedAt: (latest?.updatedAt ?? new Date(0)).toISOString(),
    };
  }
  const group = latest?.generationGroup;
  const groupId = group?.id ?? input.key;
  return {
    id: `group:${groupId}`,
    workspaceType: 'unlinked_group',
    title: group?.title ?? latest?.generatedTitle ?? '미연결 콘텐츠 작업',
    subtitle: `상세페이지 ${detailPageCount}개 · 이미지 ${imageCount}개`,
    thumbnailUrl: latest ? pickThumbnail(latest) : null,
    productId: null,
    product: null,
    generationGroupId: groupId,
    href: `/product-pipeline/registered-products?generationGroupId=${encodeURIComponent(groupId)}`,
    generationCount: input.rows.length,
    detailPageCount,
    imageCount,
    latestGenerationId: latest?.id ?? null,
    latestStatus: latest?.status ?? null,
    latestUpdatedAt: (latest?.updatedAt ?? new Date(0)).toISOString(),
  };
}

export function contentArchiveGenerationItem(
  row: ContentArchiveGenerationRow,
): ProductContentGenerationItem {
  const rowContentType = contentType(row);
  const productId = row.generationGroup.targetMasterId;
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
    activeArtifact?.sourceCandidateId ??
    row.sources.find((source) => source.sourceCandidateId)?.sourceCandidateId ??
    null;
  const detailPageRevisionId =
    activeArtifact?.currentRevisionId ??
    activeArtifact?.currentRevision?.id ??
    null;
  return {
    id: row.id,
    contentType: rowContentType,
    title: row.generatedTitle ?? (rowContentType === 'image' ? '이미지 생성 결과' : '상세페이지 결과'),
    subtitle: row.generationGroup.targetMaster?.name ?? '미연결 작업',
    thumbnailUrl: pickThumbnail(row),
    href: rowContentType === 'detail_page'
      ? detailPageEditorHref({
        generationId: row.id,
        sourceCandidateId,
      })
      : null,
    status: normalizeStatus(row.status),
    templateId: detailPageStored?.templateId ?? null,
    detailPageData: detailPageStored
      ? asPlainRecord(detailPageStored.result)
      : null,
    imageUrls: detailPageStored?.imageUrls ?? [],
    processedImages: detailPageStored?.processedImages ?? {},
    errorMessage: row.errorMessage,
    productId,
    generationGroupId: row.generationGroupId,
    sourceCandidateId,
    detailPageArtifactId: row.detailPageArtifactId,
    detailPageRevisionId,
    detailPageRevisions: (activeArtifact?.revisions ?? []).map((revision) => ({
      id: revision.id,
      revisionType: revision.revisionType,
      createdAt: revision.createdAt.toISOString(),
    })),
    sources: row.sources.map((source) => ({
      id: source.id,
      sourceType: source.sourceType,
      sourceCandidateId: source.sourceCandidateId,
      sourceContentGenerationId: source.sourceContentGenerationId,
      contentAssetId: source.contentAssetId,
      label: source.label,
    })),
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

function detailPageEditorHref(input: {
  generationId: string;
  sourceCandidateId?: string | null;
}): string {
  const generationId = encodeURIComponent(input.generationId);
  if (!input.sourceCandidateId) {
    return `/product-pipeline/detail-pages/${generationId}/editor`;
  }
  const sourceCandidateId = encodeURIComponent(input.sourceCandidateId);
  const returnTo = encodeURIComponent(`/product-pipeline/collected-products/${sourceCandidateId}`);
  return `/product-pipeline/detail-pages/${generationId}/editor?sourceCandidateId=${sourceCandidateId}&returnTo=${returnTo}`;
}

function contentType(row: Pick<ContentArchiveGenerationRow, 'contentType'>): ContentArchiveContentType {
  return row.contentType === 'image' ? 'image' : 'detail_page';
}

function pickThumbnail(row: ContentArchiveGenerationRow): string | null {
  const processed = asStringRecord((row.generationResult as Record<string, unknown>)?.processedImages);
  return processed.__heroBanner ?? sortedUsedAssets(row)[0]?.url ?? pickFirstString((row.generationInput as Record<string, unknown>)?.imageUrls);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string'
    )),
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

function normalizeDetailPageTemplateId(value: unknown): 'kids-playful' | 'bold-vertical' {
  return value === 'bold-vertical' || value === 'simple-vertical'
    ? 'bold-vertical'
    : 'kids-playful';
}

function sortedUsedAssets(row: ContentArchiveGenerationRow): Array<{
  id: string;
  url: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
  createdAt: Date;
}> {
  return row.assetUsages
    .map((usage) => usage.contentAsset)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

function normalizeStatus(status: string): string {
  if (status === 'READY' || status === 'completed') return 'completed';
  if (status === 'FAILED' || status === 'failed') return 'failed';
  if (status === 'CANCELLED' || status === 'cancelled') return 'cancelled';
  if (status === 'PROCESSING' || status === 'generating') return 'processing';
  return status.toLowerCase();
}
