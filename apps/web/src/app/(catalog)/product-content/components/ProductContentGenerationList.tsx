'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Edit3,
  ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatTime } from '@/lib/utils';
import type { ProductContentGenerationItem } from '../lib/product-content-api';
import { productContentApi } from '../lib/product-content-api';

export function ProductContentGenerationList({
  items,
  emptyLabel,
}: {
  items: ProductContentGenerationItem[];
  emptyLabel: string;
}) {
  const queryClient = useQueryClient();
  const rerun = useMutation({
    mutationFn: (generationId: string) => productContentApi.rerunSameInput(generationId),
    onSuccess: () => {
      toast.success('재생성을 시작했습니다.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.productContent.all });
    },
    onError: () => toast.error('다시 생성 요청에 실패했습니다.'),
  });

  if (items.length === 0) {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--text-secondary)]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const status = getStatusMeta(item.status);
        const canEdit = item.contentType === 'detail_page' && item.href;
        return (
          <article
            key={item.id}
            className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm md:grid-cols-[112px_1fr_auto]"
          >
            <div className="aspect-[4/3] overflow-hidden rounded-md bg-[var(--surface-sunken)]">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
                  {item.contentType === 'image' ? <ImageIcon size={24} /> : <Sparkles size={24} />}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[10px] font-black text-[var(--text-secondary)]">
                  {item.contentType === 'image' ? '이미지' : '상세페이지'}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black',
                    status.className,
                  )}
                >
                  <status.Icon size={11} className={status.spin ? 'animate-spin' : undefined} />
                  {status.label}
                </span>
                {item.generationGroupId && (
                  <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--text-tertiary)]">
                    group {item.generationGroupId.slice(0, 8)}
                  </span>
                )}
              </div>
              <h3 className="mt-2 line-clamp-2 text-sm font-black text-[var(--text-primary)]">
                {item.title}
              </h3>
              <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                {item.subtitle ?? sourceLabel(item)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-[var(--text-tertiary)]">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={11} />
                  {formatTime(item.updatedAt, {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {item.outputAssets.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon size={11} />
                    output {item.outputAssets.length}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 md:flex-col md:items-stretch md:justify-center">
              {canEdit && (
                <Link
                  href={item.href!}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--text-primary)] px-3 text-xs font-black text-white transition hover:opacity-90"
                >
                  <Edit3 size={13} />
                  편집
                </Link>
              )}
              {item.contentType === 'detail_page' && (
                <button
                  type="button"
                  onClick={() => rerun.mutate(item.id)}
                  disabled={rerun.isPending}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-black text-[var(--text-primary)] transition hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={13} className={rerun.isPending ? 'animate-spin' : undefined} />
                  재생성
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function sourceLabel(item: ProductContentGenerationItem): string {
  const explicit = item.sources.find((source) => source.sourceType !== 'input_asset');
  if (explicit?.label) return explicit.label;
  if (item.sources.length > 0) return `입력 ${item.sources.length}개`;
  return '출처 정보 없음';
}

function getStatusMeta(status: string): {
  label: string;
  className: string;
  Icon: LucideIcon;
  spin?: boolean;
} {
  if (status === 'completed') {
    return { label: '완료', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 };
  }
  if (status === 'processing' || status === 'pending') {
    return { label: '생성 중', className: 'bg-amber-50 text-amber-700', Icon: Loader2, spin: true };
  }
  if (status === 'failed') {
    return { label: '실패', className: 'bg-rose-50 text-rose-700', Icon: AlertCircle };
  }
  return { label: status, className: 'bg-slate-100 text-slate-700', Icon: Sparkles };
}
