import {
  DetailPageClientRenderPrepareResponseSchema,
  DetailPageClientRenderStatusResponseSchema,
  type DetailPageClientRenderPrepareResponse,
  type DetailPageClientRenderStatusResponse,
} from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';

export function prepareCandidateDetailImage(
  candidateId: string,
): Promise<DetailPageClientRenderPrepareResponse> {
  return apiClient
    .post<unknown>(
      `/api/ai/detail-page-image/candidate/${encodeURIComponent(candidateId)}/client-render`,
    )
    .then((response) => DetailPageClientRenderPrepareResponseSchema.parse(response));
}

export function getDetailPageRenderStatus(
  intentId: string,
): Promise<DetailPageClientRenderStatusResponse> {
  return apiClient.getParsed(
    `/api/ai/detail-page-image/render-intents/${encodeURIComponent(intentId)}`,
    DetailPageClientRenderStatusResponseSchema,
  );
}
