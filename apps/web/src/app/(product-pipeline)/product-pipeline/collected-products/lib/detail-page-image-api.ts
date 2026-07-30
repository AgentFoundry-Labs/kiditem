import {
  DetailPageClientRenderPrepareResponseSchema,
  type DetailPageClientRenderPrepareResponse,
} from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';

export function renderCandidateDetailImageOnServer(
  candidateId: string,
): Promise<DetailPageClientRenderPrepareResponse> {
  return apiClient
    .post<unknown>(
      `/api/ai/detail-page-image/candidate/${encodeURIComponent(candidateId)}/server-render`,
    )
    .then((response) => DetailPageClientRenderPrepareResponseSchema.parse(response));
}
