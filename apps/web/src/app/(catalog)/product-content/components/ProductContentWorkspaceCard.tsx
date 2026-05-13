'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Calendar, ImageIcon, Layers3, Loader2, Package, Sparkles, Trash2 } from 'lucide-react';
import { cn, formatNumber, formatTime } from '@/lib/utils';
import type { ProductContentWorkspaceItem } from '../lib/product-content-api';

export function ProductContentWorkspaceCard({
  item,
  isDeleting = false,
  onDelete,
}: {
  item: ProductContentWorkspaceItem;
  isDeleting?: boolean;
  onDelete?: () => void;
}) {
  const isProduct = item.workspaceType === 'product';
  const status = statusLabel(item.latestStatus);

  return (
    <article className="group relative flex min-h-[292px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-md">
      <Link href={item.href} className="flex flex-1 flex-col">
        <div className="relative aspect-[4/3] bg-[var(--surface-sunken)]">
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
              {isProduct ? <Package size={34} /> : <Sparkles size={34} />}
            </div>
          )}
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black text-white backdrop-blur">
            {isProduct ? <Package size={11} /> : <Layers3 size={11} />}
            {isProduct ? '상품 workspace' : '미연결 workspace'}
          </span>
          {status && (
            <span
              className={cn(
                'absolute right-2 top-2 rounded-full px-2 py-1 text-[10px] font-black backdrop-blur',
                status.className,
              )}
            >
              {status.label}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold text-[var(--text-tertiary)]">
            <span className="truncate font-mono">
              {item.product?.code ?? item.generationGroupId?.slice(0, 8) ?? 'UNLINKED'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar size={11} />
              {formatTime(item.latestUpdatedAt, {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <h2 className="line-clamp-2 text-sm font-black leading-5 text-[var(--text-primary)]">
            {item.title}
          </h2>
          <p className="mt-1 line-clamp-2 min-h-[34px] text-xs font-semibold leading-4 text-[var(--text-secondary)]">
            {item.subtitle ?? '생성 콘텐츠 workspace'}
          </p>
          <div className="mt-auto grid grid-cols-3 gap-2 pt-3">
            <Metric label="전체" value={item.generationCount} icon={<Layers3 size={12} />} />
            <Metric label="상세" value={item.detailPageCount} icon={<Sparkles size={12} />} />
            <Metric label="이미지" value={item.imageCount} icon={<ImageIcon size={12} />} />
          </div>
        </div>
      </Link>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="absolute right-2 top-11 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white/90 text-rose-600 opacity-0 shadow-sm backdrop-blur transition hover:bg-rose-50 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-70 group-hover:opacity-100"
          aria-label="workspace 삭제"
          title="workspace 삭제"
        >
          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      )}
    </article>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-md bg-[var(--surface-sunken)] px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--text-tertiary)]">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-sm font-black text-[var(--text-primary)]">
        {formatNumber(value)}
      </div>
    </div>
  );
}

function statusLabel(status: string | null): { label: string; className: string } | null {
  if (!status) return null;
  if (status === 'completed' || status === 'READY') {
    return { label: '완료', className: 'bg-emerald-50 text-emerald-700' };
  }
  if (status === 'processing' || status === 'pending' || status === 'PROCESSING') {
    return { label: '생성 중', className: 'bg-amber-50 text-amber-700' };
  }
  if (status === 'failed' || status === 'FAILED') {
    return { label: '실패', className: 'bg-rose-50 text-rose-700' };
  }
  return { label: status, className: 'bg-slate-100 text-slate-700' };
}
