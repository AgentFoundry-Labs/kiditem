'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { contentWorkspacesApi } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/content-workspaces-api';

interface EditedHtmlResponse {
  html: string | null;
  savedAt: string | null;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm';

/**
 * 판매상품의 상세 HTML — 콘텐츠 작업공간의 현재 상세 페이지 revision 이 정본이다(KID-313 W2). 몰 시트 · 등록 실행이
 * 같은 revision 을 읽는다. 저장은 새 revision 을 쌓고, 고르기는 작업공간의 현재 상세 페이지를 바꾼다.
 */
export function ContentDetailSection({ salesProductId }: { salesProductId: string }) {
  const queryClient = useQueryClient();
  const workspace = useQuery({
    queryKey: queryKeys.contentWorkspaces.forSalesProduct(salesProductId),
    queryFn: () => contentWorkspacesApi.getForSalesProduct(salesProductId),
  });
  const generationId = workspace.data?.currentDetailPageGenerationId ?? null;
  const edited = useQuery({
    queryKey: queryKeys.productContent.generationEditedHtml(generationId ?? 'none'),
    queryFn: () => apiClient.get<EditedHtmlResponse>(`/api/ai/detail-page/${encodeURIComponent(generationId!)}/edited-html`),
    enabled: generationId !== null,
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => { setDraft(null); }, [generationId]);
  const html = draft ?? edited.data?.html ?? '';

  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.contentWorkspaces.forSalesProduct(salesProductId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.productContent.all }),
  ]);
  const save = useMutation({
    mutationFn: () => apiClient.post<EditedHtmlResponse>(
      `/api/ai/detail-page/${encodeURIComponent(generationId!)}/edited-html`,
      { html },
    ),
    onSuccess: async () => {
      setDraft(null);
      await invalidate();
      toast.success('상세를 저장했습니다.');
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : '상세를 저장하지 못했습니다.'),
  });
  // 상세가 아직 없으면 첫 상세를 직접 쓴다 — 그 뒤로는 위의 저장이 새 revision 을 쌓는다.
  const create = useMutation({
    mutationFn: () => contentWorkspacesApi.createManualDetailPage(salesProductId, html),
    onSuccess: async () => {
      setDraft(null);
      await invalidate();
      toast.success('상세를 저장했습니다.');
    },
    onError: async (error) => {
      toast.error(isApiError(error) ? error.detail : '상세를 저장하지 못했습니다.');
      // 그 사이 상세가 생겼으면(409) 다시 읽어 그 상세를 고치게 한다.
      await invalidate();
    },
  });
  const select = useMutation({
    mutationFn: (contentGenerationId: string) =>
      contentWorkspacesApi.selectCurrentDetailPage(workspace.data!.id, contentGenerationId),
    onSuccess: async () => {
      await invalidate();
      toast.success('현재 상세 페이지를 바꿨습니다.');
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : '현재 상세 페이지를 바꾸지 못했습니다.'),
  });

  if (workspace.isPending) return <p className="text-sm text-slate-400">상세를 불러오는 중…</p>;
  if (workspace.isError) return <p className="text-sm text-red-600">상세를 불러오지 못했습니다.</p>;
  const versions = (workspace.data?.history ?? []).filter((item) => item.contentType === 'detail_page');
  if (!workspace.data) {
    return <p className="text-sm text-slate-500">아직 상세 페이지가 없습니다. 상세페이지 생성이나 사방넷 가져오기로 만듭니다.</p>;
  }
  if (generationId === null) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-500">아직 상세 페이지가 없습니다. 여기에 HTML 을 직접 쓰거나, 상세페이지 생성 · 사방넷 가져오기로 만듭니다.</p>
        <textarea
          aria-label="상세 HTML"
          value={html}
          onChange={(event) => setDraft(event.target.value)}
          rows={8}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        <div className="flex justify-end">
          <button
            type="button"
            className="btn-secondary btn-sm inline-flex items-center gap-1 disabled:opacity-40"
            disabled={create.isPending || !html.trim()}
            onClick={() => create.mutate()}
          >
            <Save size={13} aria-hidden />{create.isPending ? '저장 중…' : '상세 저장'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <button type="button" className={cn('tab', !preview ? 'tab-active' : 'tab-inactive')} onClick={() => setPreview(false)}>HTML</button>
          <button type="button" className={cn('tab', preview ? 'tab-active' : 'tab-inactive')} onClick={() => setPreview(true)}>미리보기</button>
        </div>
        {versions.length > 1 && (
          <label className="ml-auto flex items-center gap-1 text-xs text-slate-500">
            현재 상세 페이지
            <select
              value={generationId}
              disabled={select.isPending}
              onChange={(event) => select.mutate(event.target.value)}
              className="rounded border border-slate-200 px-2 py-1 text-xs"
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>{version.generatedTitle ?? version.id.slice(0, 8)}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {preview ? (
        <div className="max-h-[480px] overflow-y-auto rounded-lg border border-slate-200 p-3">
          <iframe title="상세 미리보기" sandbox="" srcDoc={html} className="h-[440px] w-full" />
        </div>
      ) : (
        <textarea
          aria-label="상세 HTML"
          value={html}
          onChange={(event) => setDraft(event.target.value)}
          rows={8}
          className={cn(inputClass, 'font-mono text-xs')}
        />
      )}
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-secondary btn-sm inline-flex items-center gap-1 disabled:opacity-40"
          disabled={draft === null || save.isPending || !html.trim()}
          onClick={() => save.mutate()}
        >
          <Save size={13} aria-hidden />{save.isPending ? '저장 중…' : '상세 저장'}
        </button>
      </div>
    </div>
  );
}
