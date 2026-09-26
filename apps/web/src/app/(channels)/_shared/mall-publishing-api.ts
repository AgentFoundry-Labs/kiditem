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
import {
  ChannelProductAutoMatchResponseSchema,
  type ChannelProductAutoMatchResponse,
} from '@kiditem/shared/channel-product-matching';
import {
  SabangnetMallListingsSourceSchema,
  type SabangnetMallListingsSource,
} from '@kiditem/shared/sabangnet-mall-listings';
import {
  MallAdminListingsSourceSchema,
  type MallAdminListingsSource,
} from '@kiditem/shared/mall-admin-listings';
import { apiClient } from '@/lib/api-client';

const BASE = '/api/channels/mall-publishing';
const SABANGNET_BASE = '/api/channels/sabangnet-listings';
const MALL_ADMIN_BASE = '/api/channels/mall-admin-listings';

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

  /** 사방넷 등록 상품 가져오기의 현재 — 받을 몰, 최근 실행, 최근 성공 실행과 몰별 결과. */
  sabangnetListingsSource(): Promise<SabangnetMallListingsSource> {
    return apiClient.getParsed(`${SABANGNET_BASE}/source`, SabangnetMallListingsSourceSchema);
  },

  /** 몰 관리자에서 직접 가져오는 원천의 현재 — 몰마다 한 줄(최근 실행 · 최근 성공 실행과 발행 결과). */
  mallAdminListingsSource(): Promise<MallAdminListingsSource> {
    return apiClient.getParsed(`${MALL_ADMIN_BASE}/source`, MallAdminListingsSourceSchema);
  },

  /**
   * 몰 계정 하나의 리스팅을 셀피아 SKU 에 잇는다 — 매칭 owner 의 자동 매칭이다. 비어 있는
   * 레시피만 채우고, 확정된 레시피는 건드리지 않는다.
   */
  async autoMatchAccount(channelAccountId: string): Promise<ChannelProductAutoMatchResponse> {
    const raw = await apiClient.post('/api/channels/product-mappings/auto-match', { channelAccountId });
    return ChannelProductAutoMatchResponseSchema.parse(raw);
  },

  /** 쿠팡 요약(발주확인 대기 등). 쿠팡 대시보드 API 를 읽기만 한다. */
  coupangDashboardSummary(): Promise<ChannelDashboardSummary> {
    return apiClient.getParsed('/api/coupang-dashboard', ChannelDashboardSummarySchema);
  },
};
