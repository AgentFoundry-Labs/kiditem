import type {
  MallAdapterManifestView,
  MallAvailabilityPreview,
  MallListingProfile,
  MallPreflightResponse,
  MallPublishTarget,
  UpsertMallListingProfile,
} from '@kiditem/shared/mall-publishing';
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
 * Phase 0 기준 이 클라이언트의 어떤 호출도 몰에 요청을 보내지 않는다. 읽기와
 * 프로필 편집뿐이다.
 */
export const mallPublishingApi = {
  manifests(): Promise<MallAdapterManifestView[]> {
    return apiClient.get<MallAdapterManifestView[]>(`${BASE}/manifests`);
  },

  targets(): Promise<MallPublishTarget[]> {
    return apiClient.get<MallPublishTarget[]>(`${BASE}/targets`);
  },

  profiles(mallKey?: string): Promise<MallListingProfile[]> {
    return apiClient.get<MallListingProfile[]>(`${BASE}/profiles${toQuery({ mallKey })}`);
  },

  createProfile(mallKey: string, input: UpsertMallListingProfile): Promise<MallListingProfile> {
    return apiClient.post<MallListingProfile>(`${BASE}/profiles/${mallKey}`, input);
  },

  updateProfile(profileId: string, input: UpsertMallListingProfile): Promise<MallListingProfile> {
    return apiClient.patch<MallListingProfile>(`${BASE}/profiles/${profileId}`, input);
  },

  deleteProfile(profileId: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/profiles/${profileId}`);
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

  availabilityPreview(limit = 50): Promise<MallAvailabilityPreview> {
    return apiClient.get<MallAvailabilityPreview>(
      `${BASE}/availability-preview${toQuery({ limit: String(limit) })}`,
    );
  },
};
