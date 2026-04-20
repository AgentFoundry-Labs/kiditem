'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

interface BatchResponse {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  runs: Array<{ ok: boolean; productId: string; error?: string }>;
}

export function AutoEditSection() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<BatchResponse>('/api/thumbnail-auto/batch?limit=30', {}),
    onSuccess: (data) => {
      if (data.attempted === 0) {
        toast.info(
          `자동 재편집 대상 없음 — 7일 쿨다운으로 ${data.skipped}개 스킵됨`,
        );
      } else {
        toast.success(
          `자동 재편집: 성공 ${data.succeeded} / 실패 ${data.failed} / 쿨다운 스킵 ${data.skipped}`,
        );
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
    onError: (err: unknown) => {
      const message = isApiError(err)
        ? err.detail
        : err instanceof Error
          ? err.message
          : '요청 실패';
      toast.error(`자동 재편집 실패: ${message}`);
    },
  });

  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              A등급 상품 자동 재편집
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            매출 A등급 상품 중 7일 내 자동 재편집 이력이 없는 상품 30개까지 한 번에 자동 생성.
            진행 상황은 에이전트 탭에서 확인할 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition',
            'hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              실행 중...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              지금 실행
            </>
          )}
        </button>
      </div>
    </section>
  );
}
