import {
  DetailPageClientRenderPrepareResponseSchema,
  type DetailPageClientRenderPrepareResponse,
} from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';
import { contentWorkspacesApi } from '../../_shared/lib/content-workspaces-api';

/**
 * 몰에 올릴 상세 이미지(780px 긴 이미지 한 장)를 서버가 렌더한다. 라우트는 판매상품의 콘텐츠 작업공간
 * 것 하나뿐이다(`workspace/:contentWorkspaceId/server-render`, KID-310).
 *
 * 등록 실행이 있으면 그 실행이 얼린 상세 revision(등록 대상이 고른 것, 없으면 준비 순간의 현재 것)을
 * `detailPageRevisionId` 로 넘겨 그 revision 을 렌더한다(KID-321). 없으면 작업공간의 현재 revision 이다.
 * 작업공간이 없으면 다른 이미지로 대신하지 않고 멈춘다.
 */
export async function renderRegistrationDetailImage(input: {
  salesProductId: string;
  detailPageRevisionId?: string | null;
}): Promise<DetailPageClientRenderPrepareResponse> {
  const workspace = await contentWorkspacesApi.getForSalesProduct(input.salesProductId);
  if (!workspace) throw new Error('이 상품에는 콘텐츠 작업공간이 없어 상세 이미지를 만들 수 없습니다.');
  const response = await apiClient.post<unknown>(
    `/api/ai/detail-page-image/workspace/${encodeURIComponent(workspace.id)}/server-render`,
    input.detailPageRevisionId ? { detailPageRevisionId: input.detailPageRevisionId } : {},
  );
  return DetailPageClientRenderPrepareResponseSchema.parse(response);
}
