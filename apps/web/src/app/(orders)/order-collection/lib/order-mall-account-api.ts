import { apiClient } from '@/lib/api-client';

export interface OrderCollectionMallAccount {
  key: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  loginId: string | null;
  hasPassword: boolean;
  siteUrl: string | null;
  memo: string | null;
  passwordUpdatedAt: string | null;
  updatedAt: string | null;
}

export interface UpdateOrderCollectionMallAccountInput {
  loginId: string;
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
