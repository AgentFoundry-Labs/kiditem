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
import type { MallOperationOutcomeSummary } from '@kiditem/shared/mall-operation-outcomes';
import {
  ChannelProductAutoMatchResponseSchema,
  type ChannelProductAutoMatchResponse,
} from '@kiditem/shared/channel-product-matching';
import {
  SabangnetMallListingsAttemptSchema,
  SabangnetMallListingsSourceSchema,
  type SabangnetMallListingsAttempt,
  type SabangnetMallListingsSource,
} from '@kiditem/shared/sabangnet-mall-listings';
import {
  MallAdminListingsAttemptSchema,
  MallAdminListingsSourceSchema,
  type MallAdminListingMallKey,
  type MallAdminListingsAttempt,
  type MallAdminListingsSource,
} from '@kiditem/shared/mall-admin-listings';
import { apiClient } from '@/lib/api-client';
import { mallOperationOutcomesApi } from '@/lib/mall-operation-outcomes-api';

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

  /** 쇼핑몰 에이전트의 관찰 기록 — 몰 · 작업마다 최근 결과와 결과별 건수. */
  outcomeSummary(days = 7): Promise<MallOperationOutcomeSummary> {
    return mallOperationOutcomesApi.summary(days);
  },

  /** 사방넷 등록 상품 가져오기의 현재 — 받을 몰, 최근 시도, 최근 완료와 몰별 결과. */
  sabangnetListingsSource(): Promise<SabangnetMallListingsSource> {
    return apiClient.getParsed(`${SABANGNET_BASE}/source`, SabangnetMallListingsSourceSchema);
  },

  /**
   * 사방넷 가져오기 시도를 연다. 사방넷을 읽는 것은 확장이고, 화면은 쓰기 토큰을 갖지
   * 않는다 — 응답에서 버린다.
   */
  async beginSabangnetListings(idempotencyKey: string): Promise<SabangnetMallListingsAttempt> {
    const raw = await apiClient.post(`${SABANGNET_BASE}/attempts`, {}, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return SabangnetMallListingsAttemptSchema.strip().parse(raw);
  },

  /** 운영자 중단. 확장의 쓰기 토큰 없이 owner 가 시도를 끝낸다. */
  cancelSabangnetListings(attemptId: string): Promise<unknown> {
    return apiClient.post(`${SABANGNET_BASE}/attempts/${encodeURIComponent(attemptId)}/cancel`);
  },

  /** 몰 관리자에서 직접 가져오는 원천(키드키즈 · 아이스크림몰)의 현재 — 몰마다 한 줄. */
  mallAdminListingsSource(): Promise<MallAdminListingsSource> {
    return apiClient.getParsed(`${MALL_ADMIN_BASE}/source`, MallAdminListingsSourceSchema);
  },

  /** 몰 하나의 가져오기 시도를 연다. 화면은 쓰기 토큰을 갖지 않는다 — 응답에서 버린다. */
  async beginMallAdminListings(
    mallKey: MallAdminListingMallKey,
    idempotencyKey: string,
  ): Promise<MallAdminListingsAttempt> {
    const raw = await apiClient.post(`${MALL_ADMIN_BASE}/attempts`, { mallKey }, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return MallAdminListingsAttemptSchema.strip().parse(raw);
  },

  /** 운영자 중단. */
  cancelMallAdminListings(attemptId: string): Promise<unknown> {
    return apiClient.post(`${MALL_ADMIN_BASE}/attempts/${encodeURIComponent(attemptId)}/cancel`);
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
