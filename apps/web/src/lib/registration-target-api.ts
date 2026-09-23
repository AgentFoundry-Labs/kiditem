import { z } from 'zod';
import {
  RegistrationTargetSchema,
  type RegistrationTarget,
  type RegistrationTargetUpdateInput,
  type RegistrationTargetResolveInput,
} from '@kiditem/shared/sales-product';
import { apiClient } from '@/lib/api-client';

const BASE = '/api/channels/registration-targets';
const RegistrationTargetListSchema = z.array(RegistrationTargetSchema);

export const registrationTargetKeys = {
  all: ['registration-targets'] as const,
  list: (salesProductId: string) => ['registration-targets', 'list', salesProductId] as const,
  detail: (targetId: string) => ['registration-targets', 'detail', targetId] as const,
};

export const registrationTargetApi = {
  resolve: (input: RegistrationTargetResolveInput): Promise<RegistrationTarget> =>
    apiClient.post<unknown>(`${BASE}/resolve`, input).then((response) => RegistrationTargetSchema.parse(response)),
  list: (salesProductId: string): Promise<RegistrationTarget[]> => {
    const params = new URLSearchParams({ salesProductId });
    return apiClient.getParsed(`${BASE}?${params.toString()}`, RegistrationTargetListSchema);
  },
  get: (targetId: string): Promise<RegistrationTarget> =>
    apiClient.getParsed(`${BASE}/${encodeURIComponent(targetId)}`, RegistrationTargetSchema),
  update: (targetId: string, input: RegistrationTargetUpdateInput): Promise<RegistrationTarget> =>
    apiClient.put<unknown>(`${BASE}/${encodeURIComponent(targetId)}`, input)
      .then((response) => RegistrationTargetSchema.parse(response)),
};
