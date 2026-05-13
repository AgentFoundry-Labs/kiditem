'use client';

import Link from 'next/link';
import { AlertCircle, Calendar, CheckCircle2, Edit3, Loader2, Sparkles } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import type { ProductContentCardItem } from '../lib/product-content-api';
import { buildProductContentEditorHref } from '../lib/product-content-routing';

const TEMPLATE_LABEL: Record<string, string> = {
  'bold-vertical': 'KIDITEM DESIGN',
  'kids-playful': 'Trend Vertical',
};

export function ProductContentCard({ item }: { item: ProductContentCardItem }) {
  const href = buildProductContentEditorHref({
    productId: item.productId,
    generationId: item.generationId,
  });
  const status = getStatusMeta(item.status);

  return (
    <Link
      href={href}
      className="group flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-md"
    >
      <div className="relative aspect-[4/3] bg-[var(--surface-sunken)]">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt={item.productName}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
            <Sparkles size={34} />
          </div>
        )}
        <div className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black tracking-wide text-white backdrop-blur">
          {TEMPLATE_LABEL[item.templateId] ?? item.templateId}
        </div>
        <div
          className={cn(
            'absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black backdrop-blur',
            status.className,
          )}
        >
          <status.Icon size={11} className={status.spin ? 'animate-spin' : undefined} />
          {status.label}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold text-[var(--text-tertiary)]">
          <span className="truncate font-mono">{item.productCode}</span>
          {item.isTemporaryProduct && (
            <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
              임시상품
            </span>
          )}
        </div>
        <p className="line-clamp-1 text-xs font-bold text-[var(--text-secondary)]">
          {item.productName}
        </p>
        <h2 className="mt-1 line-clamp-2 text-sm font-black leading-5 text-[var(--text-primary)]">
          {item.title}
        </h2>
        <p className="mt-1 line-clamp-2 min-h-[34px] text-xs font-medium leading-4 text-[var(--text-secondary)]">
          {item.subtitle ?? item.errorMessage ?? '상세페이지 콘텐츠'}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-tertiary)]">
            <Calendar size={11} />
            {formatTime(item.createdAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-[var(--text-primary)] px-2 py-1 text-[11px] font-bold text-white">
            <Edit3 size={12} />
            편집
          </span>
        </div>
      </div>
    </Link>
  );
}

function getStatusMeta(status: string): {
  label: string;
  className: string;
  Icon: typeof CheckCircle2;
  spin?: boolean;
} {
  if (status === 'completed') {
    return { label: '완료', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 };
  }
  if (status === 'processing' || status === 'pending') {
    return { label: '생성 중', className: 'bg-violet-50 text-violet-700', Icon: Loader2, spin: true };
  }
  if (status === 'failed') {
    return { label: '실패', className: 'bg-rose-50 text-rose-700', Icon: AlertCircle };
  }
  return { label: status, className: 'bg-slate-100 text-slate-600', Icon: Sparkles };
}
