import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { contentWorkspacesApi, type ContentWorkspaceSummary } from '../lib/content-workspaces-api';

/**
 * 판매상품 초안의 콘텐츠 작업공간 — 수집상품 화면이 작업공간 id 를 얻는 유일한 길이다.
 *
 * 작업공간이 없으면(`workspaceId: null`) 상세 · 썸네일 이력, KC 자동 채우기, 등록 콘텐츠 선택은
 * 돌지 않는다. 후보 id 로 대신 묻지 않는다 — 서버는 그 필터를 거절하고, 무시하던 시절에는 조직
 * 전체의 콘텐츠를 이 상품의 것처럼 돌려줬다. 생성을 시작한 뒤에는 이 key 를 invalidate 한다.
 */
export function useSalesProductWorkspace(salesProductId: string | null | undefined): {
  workspaceId: string | null;
  workspace: ContentWorkspaceSummary | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.contentWorkspaces.forSalesProduct(salesProductId ?? ''),
    queryFn: () => contentWorkspacesApi.getForSalesProduct(salesProductId!),
    enabled: !!salesProductId,
  });
  const workspace = query.data ?? null;
  return { workspaceId: workspace?.id ?? null, workspace, isLoading: !!salesProductId && query.isLoading };
}
