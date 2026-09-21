import type {
  MallAdapterManifestView,
  MallAvailabilityPreview,
  MallChannelOverview,
  MallListingMatrixResponse,
  MallMatrixFilter,
  MallPreflightResponse,
  MallPublishTarget,
} from '@kiditem/shared/mall-publishing';
import {
  ChannelDashboardSummarySchema,
  type ChannelDashboardSummary,
} from '@kiditem/shared/channel-dashboard';
import { apiClient } from '@/lib/api-client';

const BASE = '/api/channels/mall-publishing';

function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/**
 * 몰별 상품등록·품절 API.
 *
 * 이 클라이언트의 어떤 호출도 몰에 요청을 보내지 않는다. 전부 읽기다 — 몰 계정과 그
 * 등록 기본값은 쇼핑몰 계정 화면(Orders)이 가진다.
 */
export const mallPublishingApi = {
  manifests(): Promise<MallAdapterManifestView[]> {
    return apiClient.get<MallAdapterManifestView[]>(`${BASE}/manifests`);
  },

  targets(): Promise<MallPublishTarget[]> {
    return apiClient.get<MallPublishTarget[]>(`${BASE}/targets`);
  },

  preflight(params: {
    mallKeys?: string[];
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<MallPreflightResponse> {
    return apiClient.get<MallPreflightResponse>(
      `${BASE}/preflight${toQuery({
        mallKeys: params.mallKeys?.length ? params.mallKeys.join(',') : undefined,
        search: params.search,
        page: params.page ? String(params.page) : undefined,
        limit: params.limit ? String(params.limit) : undefined,
      })}`,
    );
  },

  /** 상품 × 몰 등록 현황. 읽기 전용이다. */
  listingMatrix(params: {
    mallKeys?: string[];
    filter?: MallMatrixFilter;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<MallListingMatrixResponse> {
    return apiClient.get<MallListingMatrixResponse>(
      `${BASE}/listing-matrix${toQuery({
        mallKeys: params.mallKeys?.length ? params.mallKeys.join(',') : undefined,
        filter: params.filter,
        search: params.search,
        page: params.page ? String(params.page) : undefined,
        limit: params.limit ? String(params.limit) : undefined,
      })}`,
    );
  },

  channelOverview(): Promise<MallChannelOverview> {
    return apiClient.get<MallChannelOverview>(`${BASE}/channel-overview`);
  },

  availabilityPreview(limit = 50): Promise<MallAvailabilityPreview> {
    return apiClient.get<MallAvailabilityPreview>(
      `${BASE}/availability-preview${toQuery({ limit: String(limit) })}`,
    );
  },

  /** 쿠팡 요약(발주확인 대기 등). 쿠팡 대시보드 API 를 읽기만 한다. */
  coupangDashboardSummary(): Promise<ChannelDashboardSummary> {
    return apiClient.getParsed('/api/coupang-dashboard', ChannelDashboardSummarySchema);
  },
};
