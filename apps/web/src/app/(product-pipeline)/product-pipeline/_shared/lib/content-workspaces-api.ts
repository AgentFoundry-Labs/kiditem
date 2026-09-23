import { apiClient } from '@/lib/api-client';

export interface ContentWorkspaceHistoryItem {
  id: string;
  contentType: string;
  status: string;
  generatedTitle: string | null;
  templateId: string | null;
  generationInput: unknown;
  detailPageData: Record<string, unknown> | null;
  imageUrls: string[];
  processedImages: Record<string, string>;
  detailPageArtifactId: string | null;
  href: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentWorkspaceSummary {
  id: string;
  ownerType: string;
  /** 판매상품 초안의 작업공간이면 그 판매상품 id. 초안 하나에 작업공간은 하나다. */
  salesProductId: string | null;
  channelListingId: string | null;
  originWorkspaceId: string | null;
  displayName: string;
  normalizedTitle: string;
  status: string;
  href: string;
  generationCount: number;
  latestGenerationId: string | null;
  latestStatus: string | null;
  currentDetailPageArtifactId: string | null;
  currentDetailPageRevisionId: string | null;
  currentDetailPageGenerationId: string | null;
  currentThumbnailSelection: {
    id: string;
    contentAssetId: string;
    url: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  history: ContentWorkspaceHistoryItem[];
}

interface ContentWorkspaceListResponse {
  items: ContentWorkspaceSummary[];
  total: number;
  page: number;
  limit: number;
}

interface DuplicateContentWorkspaceResponse {
  exists: boolean;
  workspace: ContentWorkspaceSummary | null;
}

export const contentWorkspacesApi = {
  async list(params?: {
    page?: number;
    limit?: number;
    title?: string;
  }): Promise<ContentWorkspaceListResponse> {
    const qs = new URLSearchParams({
      page: String(params?.page ?? 1),
      limit: String(params?.limit ?? 24),
    });
    if (params?.title) qs.set('title', params.title);
    return apiClient.get<ContentWorkspaceListResponse>(
      `/api/ai/content-workspaces?${qs}`,
    );
  },

  async get(id: string): Promise<ContentWorkspaceSummary> {
    return apiClient.get<ContentWorkspaceSummary>(
      `/api/ai/content-workspaces/${encodeURIComponent(id)}`,
    );
  },

  /**
   * 판매상품 초안의 작업공간. 콘텐츠를 아직 만든 적이 없으면 `null` — 읽기는 작업공간을 만들지
   * 않고, 만드는 일은 생성(`POST /api/products/sales-products/:id/generation`)이 한다.
   */
  async getForSalesProduct(salesProductId: string): Promise<ContentWorkspaceSummary | null> {
    const result = await apiClient.get<{ workspace: ContentWorkspaceSummary | null }>(
      `/api/ai/content-workspaces/by-sales-product/${encodeURIComponent(salesProductId)}`,
    );
    return result.workspace;
  },

  async checkDuplicate(title: string): Promise<DuplicateContentWorkspaceResponse> {
    const qs = new URLSearchParams({ title });
    return apiClient.get<DuplicateContentWorkspaceResponse>(
      `/api/ai/content-workspaces/duplicate-check?${qs}`,
    );
  },

  async archive(id: string): Promise<{ ok: true; archivedWorkspaces: number }> {
    return apiClient.delete<{ ok: true; archivedWorkspaces: number }>(
      `/api/ai/content-workspaces/${encodeURIComponent(id)}`,
    );
  },

  async selectCurrentDetailPage(
    id: string,
    contentGenerationId: string,
  ): Promise<ContentWorkspaceSummary> {
    return apiClient.patch<ContentWorkspaceSummary>(
      `/api/ai/content-workspaces/${encodeURIComponent(id)}/current-detail-page`,
      { contentGenerationId },
    );
  },

  /**
   * 워크스페이스가 소유한 썸네일 미리보기 목록을 통째로 교체한다.
   *
   * `RegistrationTarget` 이 없는 후보는 `registrationInput.thumbnailUrls` 를 못 쓰므로
   * 이 경로가 목록의 유일한 저장처이고, 저장된 목록은 `registrationImages.thumbnail`
   * (= 쿠팡 WING 추가이미지 소스)로 다시 읽힌다.
   */
  async replaceThumbnailGallery(
    id: string,
    thumbnailUrls: string[],
  ): Promise<{ thumbnailUrls: string[] }> {
    return apiClient.put<{ thumbnailUrls: string[] }>(
      `/api/ai/content-workspaces/${encodeURIComponent(id)}/thumbnail-gallery`,
      { thumbnailUrls },
    );
  },

  async selectCurrentThumbnail(
    id: string,
    selection:
      | { contentAssetId: string }
      | {
          sourceThumbnailGenerationId: string;
          sourceThumbnailCandidateId: string;
        }
      | { externalUrl: string },
  ): Promise<ContentWorkspaceSummary> {
    return apiClient.patch<ContentWorkspaceSummary>(
      `/api/ai/content-workspaces/${encodeURIComponent(id)}/current-thumbnail`,
      selection,
    );
  },
};
