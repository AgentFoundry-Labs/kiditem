'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

interface BatchResponse {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  runs: Array<{ ok: boolean; contentWorkspaceId: string; error?: string }>;
}

export function AutoEditSection() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiClient.post<BatchResponse>('/api/thumbnail-auto/batch?limit=30', {}),
    onSuccess: (data) => {
      if (data.attempted === 0) {
        toast.info(`자동 재편집 대상 없음 — 7일 쿨다운으로 ${data.skipped}개 스킵됨`);
      } else {
        toast.success(`자동 재편집: 성공 ${data.succeeded} / 실패 ${data.failed} / 쿨다운 스킵 ${data.skipped}`);
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.thumbnailAnalysis.all,
      });
    },
    onError: (err: unknown) => {
      const message = isApiError(err) ? err.detail : err instanceof Error ? err.message : '요청 실패';
      toast.error(`자동 재편집 실패: ${message}`);
    },
  });

  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-6 py-4 shadow-[0_8px_32px_rgba(16,185,129,0.08)]">
      {/* Decorative gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-emerald-300/30 to-teal-300/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-gradient-to-tr from-teal-200/30 to-emerald-200/20 blur-2xl"
      />

      <div className="relative flex items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          {/* Icon badge */}
          <div className="relative shrink-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Zap className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center shadow-md">
              <Sparkles className="h-2.5 w-2.5 text-white" strokeWidth={3} />
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">A등급 상품 자동 재편집</h2>
            <p className="mt-0.5 text-sm text-slate-600 leading-snug">
              매출 상위 상품 중 7일 내 재편집 이력이 없는 것들만 선별해서 한 번에 AI 생성.
              <span className="text-slate-500"> 진행 상황은 작업 알림에서 확인.</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className={cn(
            'group relative shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-500/30 transition-all',
            'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/40',
            'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
          )}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              실행 중...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" strokeWidth={2.5} />
              지금 실행
            </>
          )}
        </button>
      </div>
    </section>
  );
}
