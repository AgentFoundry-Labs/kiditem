import type { DetailPageSource, DetailPageStatus, DetailPageWithRevisions } from '@kiditem/shared/product-content';
import { apiClient } from '@/lib/api-client';

/**
 * 작업공간의 상세 페이지 한 행(KID-313 W3b). `id` 는 상세 페이지 id — 편집기 · 생성 · 이력 · 허브가 같은 id 로
 * `/api/ai/detail-page/:id` 를 부른다. 생성 결과(`detailPageData`)는 생성 페이지에만 있다.
 */
export interface ContentWorkspaceHistoryItem {
  id: string;
  source: DetailPageSource;
  status: DetailPageStatus;
  title: string | null;
  templateId: string | null;
  generationInput: unknown;
  detailPageData: Record<string, unknown> | null;
  imageUrls: string[];
  processedImages: Record<string, string>;
  currentRevisionId: string | null;
  errorMessage: string | null;
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
  /** 직접 상세 작업공간의 중복 방지 제목. 판매 상품 · 리스팅 작업공간은 null — 이름은 상품에서 읽는다. */
  normalizedTitle: string | null;
  status: string;
  href: string;
  detailPageCount: number;
  latestDetailPageId: string | null;
  latestStatus: string | null;
  /** 몰로 가는 현재 revision 과 그 revision 의 상세 페이지. */
  currentDetailPageId: string | null;
  currentDetailPageRevisionId: string | null;
  currentThumbnailSelection: {
    id: string;
    contentAssetId: string;
    url: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  history: ContentWorkspaceHistoryItem[];
}

/**
 * 작업공간을 화면에 부르는 이름. 작업공간은 이름을 갖지 않으므로(KID-313 W3) 가장 최근 상세 페이지의 제목, 그 생성
 * 입력의 상품명, 직접 상세의 중복 방지 제목 순으로 읽는다. 판매 상품의 이름이 있으면 부르는 쪽이 그것을 쓴다.
 */
export function contentWorkspaceLabel(workspace: Pick<ContentWorkspaceSummary, 'history' | 'normalizedTitle'>): string {
  const latest = workspace.history[0];
  const input = latest?.generationInput && typeof latest.generationInput === 'object'
    ? latest.generationInput as { rawTitle?: unknown }
    : {};
  const rawTitle = typeof input.rawTitle === 'string' && input.rawTitle.trim() ? input.rawTitle.trim() : null;
  return latest?.title?.trim() || rawTitle || workspace.normalizedTitle || '상품명 미지정';
}

/** 초안의 등록용 사진(`ContentAsset.role` 별). 수집 원본(`role = 'source'`)은 담지 않는다. */
export interface SalesProductRegistrationImages {
  primary: string[];
  thumbnail: string[];
  detail: string[];
}

/** 초안이 저장해 둔 대표 썸네일. */
export interface SalesProductCurrentThumbnail {
  url: string;
  sourceThumbnailGenerationId: string | null;
  sourceThumbnailCandidateId: string | null;
}

export interface SalesProductRegistrationMedia {
  registrationImages: SalesProductRegistrationImages;
  currentThumbnail: SalesProductCurrentThumbnail | null;
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

  /**
   * 판매상품 작업공간의 현재 상세 HTML — 허브가 읽는 길(작업공간의 현재 상세 페이지 → 저장된 HTML)이다.
   * 작업공간이나 상세가 없으면 `null`. 판매상품 필드로 대신하지 않는다(KID-313).
   */
  async getCurrentDetailHtml(salesProductId: string): Promise<string | null> {
    const workspace = await contentWorkspacesApi.getForSalesProduct(salesProductId);
    const detailPageId = workspace?.currentDetailPageId;
    if (!detailPageId) return null;
    const saved = await apiClient.get<{ html: string | null }>(
      `/api/ai/detail-page/${encodeURIComponent(detailPageId)}/edited-html`,
    );
    return saved.html?.trim() ? saved.html : null;
  },

  /** 상세 페이지 하나와 그 revision 이력(새 것부터). */
  async getDetailPageRevisions(detailPageId: string): Promise<DetailPageWithRevisions> {
    return apiClient.get<DetailPageWithRevisions>(
      `/api/ai/detail-page/${encodeURIComponent(detailPageId)}/revisions`,
    );
  },

  /**
   * 상세가 없는 판매상품에 첫 상세를 쓴다(`manual_edit` revision 이 현재가 된다). 이미 상세가 있으면 409 —
   * 그때는 현재 상세 페이지의 edited-html 저장으로 고친다.
   */
  async createManualDetailPage(
    salesProductId: string,
    html: string,
  ): Promise<{ workspaceId: string; revisionId: string; detailPageId: string }> {
    return apiClient.post(
      `/api/ai/content-workspaces/by-sales-product/${encodeURIComponent(salesProductId)}/manual-detail-page`,
      { html },
    );
  },

  /**
   * 초안의 등록용 사진과 저장한 대표 썸네일. 콘텐츠를 만든 적이 없으면 빈 목록과 `null` 이다 —
   * 원천 기록(수집상품)을 거쳐 읽지 않는다.
   */
  async getRegistrationMedia(salesProductId: string): Promise<SalesProductRegistrationMedia> {
    return apiClient.get<SalesProductRegistrationMedia>(
      `/api/ai/content-workspaces/by-sales-product/${encodeURIComponent(salesProductId)}/registration-media`,
    );
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
    detailPageId: string,
  ): Promise<ContentWorkspaceSummary> {
    return apiClient.patch<ContentWorkspaceSummary>(
      `/api/ai/content-workspaces/${encodeURIComponent(id)}/current-detail-page`,
      { detailPageId },
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
