import type { MallListingProfile, UpdateMallListingProfile } from '@kiditem/shared/channel-account';
import { apiClient } from '@/lib/api-client';

export interface OrderCollectionMallAccount {
  key: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  loginId: string | null;
  supplierLoginId?: string | null;
  hasPassword: boolean;
  siteUrl: string | null;
  memo: string | null;
  passwordUpdatedAt: string | null;
  /** 카드 순서. null 이면 기본 순서. */
  sortOrder?: number | null;
  /** 계정 행 id. 행이 없으면 null — 등록 기본값은 행이 있어야 저장된다. */
  channelAccountId?: string | null;
  /** 등록 기본값 문서(`config.listingProfile`). 저장한 적 없으면 null (KID-235). */
  listingProfile?: MallListingProfile | null;
  updatedAt: string | null;
}

export interface UpdateOrderCollectionMallAccountInput {
  loginId: string;
  supplierLoginId?: string;
  password?: string;
  siteUrl: string;
  memo: string;
  enabled: boolean;
}

/** 자동 로그인에 쓰는 저장 자격. 몰과 쿠팡 윙(`coupang`, 대표 윙 계정 행 — KID-377)이 같은 모양이다. */
export interface OrderCollectionMallPassword {
  key: string;
  loginId?: string | null;
  supplierLoginId?: string | null;
  password: string | null;
}

export const orderMallAccountApi = {
  list(): Promise<OrderCollectionMallAccount[]> {
    return apiClient.get<OrderCollectionMallAccount[]>('/api/orders/collection/malls');
  },

  /** 화면에 보이는 순서대로 몰 키를 보내면 그 순서로 저장된다. */
  reorder(mallKeys: string[]): Promise<OrderCollectionMallAccount[]> {
    return apiClient.patch<OrderCollectionMallAccount[]>(
      '/api/orders/collection/malls/display-order',
      { mallKeys },
    );
  },

  update(
    mallKey: string,
    input: UpdateOrderCollectionMallAccountInput,
  ): Promise<OrderCollectionMallAccount> {
    return apiClient.patch<OrderCollectionMallAccount>(
      `/api/orders/collection/malls/${encodeURIComponent(mallKey)}`,
      input,
    );
  },

  /** 등록 기본값만 고친다 — 보낸 키만 바뀌고 나머지는 서버가 보존한다(KID-235). */
  updateListingProfile(
    mallKey: string,
    input: UpdateMallListingProfile,
  ): Promise<OrderCollectionMallAccount> {
    return apiClient.patch<OrderCollectionMallAccount>(
      `/api/orders/collection/malls/${encodeURIComponent(mallKey)}/listing-profile`,
      input,
    );
  },

  password(mallKey: string): Promise<OrderCollectionMallPassword> {
    return apiClient.get<OrderCollectionMallPassword>(
      `/api/orders/collection/malls/${encodeURIComponent(mallKey)}/password`,
    );
  },
};
