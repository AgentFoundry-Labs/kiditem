'use client';

import { type ReactNode } from 'react';
import { Bell, Download, FileSpreadsheet, Send } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';

const FEED_LIMIT = 9;

interface ActivityMeta {
  icon: ReactNode;
  bg: string;
  fg: string;
  title: string;
  sub: string;
}

/**
 * 우측 "최근 활동" 피드 — 수집/변환/자동감지/셀피아 전송 이벤트를 시간순으로 보여준다.
 * 생성 파일(history)에서 파생하므로 별도 상태가 필요 없다.
 */
export function OrderActivityFeed({
  history,
  className,
}: {
  history: StoredOrderCollectionFile[];
  className?: string;
}) {
  const items = [...history].sort((a, b) => b.convertedAt - a.convertedAt).slice(0, FEED_LIMIT);

  return (
    <section
      className={cn('flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white', className)}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="text-sm font-semibold text-slate-900">최근 활동</div>
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          실시간
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 py-12 text-center text-sm text-slate-400">
          아직 활동이 없습니다.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.map((item) => {
            const meta = activityMeta(item);
            return (
              <div key={item.id} className="flex gap-3 border-t border-slate-100 px-5 py-3 first:border-t-0">
                <span className={cn('flex h-8 w-8 flex-none items-center justify-center rounded-lg', meta.bg, meta.fg)}>
                  {meta.icon}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{meta.title}</div>
                  <div className="truncate text-xs text-slate-400">{meta.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function activityMeta(item: StoredOrderCollectionFile): ActivityMeta {
  const orders = orderCount(item);
  const mall = item.mallName ?? '주문';

  if (item.sentAt) {
    return {
      icon: <Send size={15} />,
      bg: 'bg-emerald-50',
      fg: 'text-emerald-600',
      title: `셀피아 전송 · ${mall}`,
      sub: `${formatNumber(orders)}건 · ${shortTime(item.sentAt)}`,
    };
  }
  if (item.id.includes('-auto')) {
    return {
      icon: <Bell size={15} />,
      bg: 'bg-purple-50',
      fg: 'text-purple-700',
      title: `새 주문 ${formatNumber(orders)}건 감지`,
      sub: `${mall} · ${shortTime(item.convertedAt)}`,
    };
  }
  if (item.collectionMode === 'manual-upload') {
    return {
      icon: <FileSpreadsheet size={15} />,
      bg: 'bg-slate-100',
      fg: 'text-slate-500',
      title: `업로드 변환 ${formatNumber(orders)}건`,
      sub: `${mall} · ${shortTime(item.convertedAt)}`,
    };
  }
  return {
    icon: <Download size={15} />,
    bg: 'bg-slate-100',
    fg: 'text-slate-500',
    title: `수집·변환 ${formatNumber(orders)}건`,
    sub: `${mall} · ${shortTime(item.convertedAt)}`,
  };
}

function orderCount(item: StoredOrderCollectionFile): number {
  if (item.outputRows === null || item.productRows === null) return 0;
  return Math.max(0, item.outputRows - item.productRows);
}

function shortTime(timestamp: number): string {
  const value = new Date(timestamp);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}
