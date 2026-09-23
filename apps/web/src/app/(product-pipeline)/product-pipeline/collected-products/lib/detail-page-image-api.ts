import {
  DetailPageClientRenderPrepareResponseSchema,
  type DetailPageClientRenderPrepareResponse,
} from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';
import { contentWorkspacesApi } from '../../_shared/lib/content-workspaces-api';
import { contentWorkspaceHistoryToGenerationHistory } from '../../_shared/lib/detail-generation-history';
import { buildGenerationHistoryHtml } from '../../_shared/lib/generated-detail-html';
import type { ProductDetailResponse } from './sourcing-api';

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

/** 렌더가 끝난 상세 이미지만 받는다. 없으면 다른 이미지로 대신하지 않고 멈춘다 — 잘못된 상세가 올라가는 것이 더 나쁘다. */
export function requireRenderedDetailImage(rendered: DetailPageClientRenderPrepareResponse): string {
  if (rendered.status !== 'ready') {
    const message = rendered.status === 'missing' ? rendered.message : '상세페이지 이미지 생성이 완료되지 않았습니다.';
    throw new Error(`${message} 저장한 상세페이지가 있는 상품만 몰에 올릴 수 있습니다.`);
  }
  return rendered.imageUrl;
}

/**
 * 판매상품의 현재 상세를 렌더한다. 저장한 상세가 아직 없고 다 만든 상세 생성만 있으면, 그 생성을 한 번 저장한 뒤
 * 다시 렌더한다 — 생성 결과를 사람이 에디터에서 한 번 열어 저장하지 않아도 몰에 올릴 수 있게 하는 길이다.
 */
export async function prepareSavedDetailImage(
  detail: Pick<ProductDetailResponse, 'salesProductId'>,
): Promise<DetailPageClientRenderPrepareResponse> {
  const salesProductId = detail.salesProductId ?? '';
  const firstRender = await renderRegistrationDetailImage({ salesProductId });
  if (
    firstRender.status === 'ready'
    || firstRender.status !== 'missing'
    || firstRender.reason !== 'no_saved_detail_page'
    || !salesProductId
  ) {
    return firstRender;
  }

  const workspace = await contentWorkspacesApi.getForSalesProduct(salesProductId);
  if (!workspace || workspace.currentDetailPageRevisionId) return firstRender;

  const history = contentWorkspaceHistoryToGenerationHistory(workspace.history);
  const preferredGenerationIds = [
    workspace.currentDetailPageGenerationId,
    workspace.latestGenerationId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
  const generated = preferredGenerationIds
    .map((id) => history.find((item) => item.id === id))
    .find((item) => item?.detailPageData && ['READY', 'COMPLETED'].includes(item.status))
    ?? history.find((item) => item.detailPageData && ['READY', 'COMPLETED'].includes(item.status));
  if (!generated) return firstRender;

  const templateCss = await fetch('/templates-styles.css', { cache: 'no-store' })
    .then((response) => (response.ok ? response.text() : ''))
    .catch(() => '');
  const html = buildGenerationHistoryHtml(generated, templateCss);
  await apiClient.post(`/api/ai/detail-page/${encodeURIComponent(generated.id)}/edited-html`, { html });
  return renderRegistrationDetailImage({ salesProductId });
}
