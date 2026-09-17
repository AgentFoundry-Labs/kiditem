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

export interface OrderCollectionMallPassword {
  key: string;
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

  password(mallKey: string): Promise<OrderCollectionMallPassword> {
    return apiClient.get<OrderCollectionMallPassword>(
      `/api/orders/collection/malls/${encodeURIComponent(mallKey)}/password`,
    );
  },
};
