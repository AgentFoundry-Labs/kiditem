import { apiClient } from '@/lib/api-client';

export interface ProductContentCardItem {
  generationId: string;
  productId: string;
  productCode: string;
  productName: string;
  title: string;
  subtitle: string | null;
  templateId: 'kids-playful' | 'bold-vertical' | string;
  status: 'completed' | 'processing' | 'failed' | 'cancelled' | string;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  isTemporaryProduct: boolean;
  editedHtmlSavedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductContentCardsResponse {
  items: ProductContentCardItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ProductContentWorkProductItem {
  id: string;
  productId: string | null;
  templateId: string;
  productName: string;
  imageUrls: string[];
  processedImages: Record<string, string>;
  imageProcessingStatus: string;
  imageProcessingError: string | null;
  createdAt: string;
}

export interface ProductContentAssetItem {
  id: string;
  productId: string | null;
  generationId: string | null;
  url: string;
  assetType: string;
  sourceType: string;
  pipelineType: string;
  usageType: string;
  originType: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
  metadata: unknown;
  product: { id: string; code: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductContentAssetsResponse {
  items: ProductContentAssetItem[];
  total: number;
  page: number;
  limit: number;
}

export type ProductContentWorkspaceType = 'product' | 'unlinked_group';
export type ProductContentArchiveType = 'detail_page' | 'image';

export interface ProductContentWorkspaceItem {
  id: string;
  workspaceType: ProductContentWorkspaceType;
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
  contentType: ProductContentArchiveType;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  href: string | null;
  status: string;
  productId: string | null;
  generationGroupId: string | null;
  sources: Array<{
    id: string;
    sourceType: string;
    sourceCandidateId: string | null;
    masterId: string | null;
    sourceContentGenerationId: string | null;
    contentAssetId: string | null;
    label: string | null;
  }>;
  outputAssets: Array<{ id: string; url: string; role: string | null; label: string | null }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProductContentWorkspaceListResponse {
  items: ProductContentWorkspaceItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ProductContentWorkspaceDetailResponse {
  workspace: ProductContentWorkspaceItem;
  generations: ProductContentGenerationItem[];
  total: number;
  page: number;
  limit: number;
}

export interface DeleteProductContentWorkspaceResponse {
  ok: true;
  deletedGenerations: number;
  deletedAssets: number;
}

export interface ProductContentWorkspaceParams {
  page?: number;
  limit?: number;
  contentType?: ProductContentArchiveType | null;
  linkState?: 'linked' | 'unlinked' | null;
  status?: string | null;
  productId?: string | null;
  sourceCandidateId?: string | null;
}

export interface ProductSearchItem {
  id: string;
  code?: string | null;
  name: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  representativeSku?: string | null;
}

export interface ProductSearchResponse {
  items: ProductSearchItem[];
  nextCursor?: string | null;
}

function workspaceParams(params: ProductContentWorkspaceParams = {}): string {
  const qs = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 24),
  });
  if (params.contentType) qs.set('contentType', params.contentType);
  if (params.linkState) qs.set('linkState', params.linkState);
  if (params.status) qs.set('status', params.status);
  if (params.productId) qs.set('productId', params.productId);
  if (params.sourceCandidateId) qs.set('sourceCandidateId', params.sourceCandidateId);
  return qs.toString();
}

export const productContentApi = {
  listWorkspaces(
    params: ProductContentWorkspaceParams = {},
  ): Promise<ProductContentWorkspaceListResponse> {
    return apiClient.get<ProductContentWorkspaceListResponse>(
      `/api/ai/content-archive/workspaces?${workspaceParams(params)}`,
    );
  },
  listProductWorkspace(
    productId: string,
    params: ProductContentWorkspaceParams = {},
  ): Promise<ProductContentWorkspaceDetailResponse> {
    return apiClient.get<ProductContentWorkspaceDetailResponse>(
      `/api/ai/content-archive/products/${encodeURIComponent(productId)}?${workspaceParams(params)}`,
    );
  },
  listGroupWorkspace(
    groupId: string,
    params: ProductContentWorkspaceParams = {},
  ): Promise<ProductContentWorkspaceDetailResponse> {
    return apiClient.get<ProductContentWorkspaceDetailResponse>(
      `/api/ai/content-archive/groups/${encodeURIComponent(groupId)}?${workspaceParams(params)}`,
    );
  },
  deleteWorkspace(
    item: ProductContentWorkspaceItem,
  ): Promise<DeleteProductContentWorkspaceResponse> {
    if (item.workspaceType === 'product' && item.productId) {
      return apiClient.delete<DeleteProductContentWorkspaceResponse>(
        `/api/ai/content-archive/products/${encodeURIComponent(item.productId)}`,
      );
    }
    if (item.workspaceType === 'unlinked_group' && item.generationGroupId) {
      return apiClient.delete<DeleteProductContentWorkspaceResponse>(
        `/api/ai/content-archive/groups/${encodeURIComponent(item.generationGroupId)}`,
      );
    }
    throw new Error('Invalid product-content workspace');
  },
  listSourcingLinks(
    candidateId: string,
    params: ProductContentWorkspaceParams = {},
  ): Promise<{ items: ProductContentGenerationItem[]; total: number; page: number; limit: number }> {
    return apiClient.get(
      `/api/ai/content-archive/sourcing/${encodeURIComponent(candidateId)}?${workspaceParams(params)}`,
    );
  },
  rerunSameInput(generationId: string): Promise<unknown> {
    return apiClient.post(`/api/ai/content-archive/${encodeURIComponent(generationId)}/rerun`, {});
  },
  attachGroupToProduct(
    groupId: string,
    productId: string,
  ): Promise<ProductContentWorkspaceDetailResponse> {
    return apiClient.post<ProductContentWorkspaceDetailResponse>(
      `/api/ai/content-archive/groups/${encodeURIComponent(groupId)}/attach-product`,
      { productId },
    );
  },
  searchProducts(query: string): Promise<ProductSearchResponse> {
    const qs = new URLSearchParams({ search: query, limit: '8' });
    return apiClient.get<ProductSearchResponse>(`/api/products/masters?${qs}`);
  },
  listCards(params: {
    page?: number;
    limit?: number;
    productId?: string | null;
  } = {}): Promise<ProductContentCardsResponse> {
    const qs = new URLSearchParams({
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 20),
    });
    if (params.productId) qs.set('productId', params.productId);
    return apiClient.get<ProductContentCardsResponse>(`/api/products/content/cards?${qs}`);
  },
  listWorkProducts(): Promise<ProductContentWorkProductItem[]> {
    return apiClient.get<ProductContentWorkProductItem[]>('/api/ai/detail-page');
  },
  listAssets(params: {
    page?: number;
    limit?: number;
    productId?: string | null;
  } = {}): Promise<ProductContentAssetsResponse> {
    const qs = new URLSearchParams({
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 24),
    });
    if (params.productId) qs.set('productId', params.productId);
    return apiClient.get<ProductContentAssetsResponse>(`/api/ai/content-assets?${qs}`);
  },
};
