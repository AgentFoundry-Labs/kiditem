'use client';

import { type ReactNode } from 'react';
import { AlertCircle, Bell, Download, FileSpreadsheet, Inbox, LogIn, Send, ShieldAlert } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { getHistoryOrderCount } from '../lib/order-history-count';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';

const FEED_LIMIT = 40;

interface ActivityMeta {
  icon: ReactNode;
  bg: string;
  fg: string;
  title: string;
  sub: string;
}

/** 수집·전송 외 이벤트(주문 없음/오류/로그인·인증 필요)도 피드에 뜨게 하는 이벤트 타입. */
export interface OrderActivityEvent {
  id: string;
  kind: 'empty' | 'error' | 'login' | 'auth';
  mallName: string;
  message: string;
  at: number;
}

/**
 * 우측 "최근 활동" 피드 — 수집/변환/자동감지/셀피아 전송 요청 + 주문 없음/오류 이벤트를 시간순으로 보여준다.
 * 생성 파일(history)에서 파생 + page 가 넘겨준 events(주문 없음/오류) 를 병합한다.
 */
export function OrderActivityFeed({
  history,
  events,
  className,
}: {
  history: StoredOrderCollectionFile[];
  events?: OrderActivityEvent[];
  className?: string;
}) {
  const items = [
    ...history.map((h) => ({
      id: h.id,
      at: h.transmissionRequestedAt ?? h.convertedAt,
      meta: activityMeta(h),
    })),
    ...(events ?? []).map((e) => ({ id: e.id, at: e.at, meta: eventMeta(e) })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, FEED_LIMIT);

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
          {items.map((item) => (
            <div key={item.id} className="flex gap-3 border-t border-slate-100 px-5 py-3 first:border-t-0">
              <span
                className={cn(
                  'flex h-8 w-8 flex-none items-center justify-center rounded-lg',
                  item.meta.bg,
                  item.meta.fg,
                )}
              >
                {item.meta.icon}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">{item.meta.title}</div>
                <div className="truncate text-xs text-slate-400">{item.meta.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function eventMeta(e: OrderActivityEvent): ActivityMeta {
  if (e.kind === 'auth') {
    return {
      icon: <ShieldAlert size={15} />,
      bg: 'bg-amber-50',
      fg: 'text-amber-600',
      title: `인증 필요 · ${e.mallName}`,
      sub: `${e.message} · ${shortTime(e.at)}`,
    };
  }
  if (e.kind === 'login') {
    return {
      icon: <LogIn size={15} />,
      bg: 'bg-amber-50',
      fg: 'text-amber-600',
      title: `로그인 필요 · ${e.mallName}`,
      sub: `${e.message} · ${shortTime(e.at)}`,
    };
  }
  if (e.kind === 'error') {
    return {
      icon: <AlertCircle size={15} />,
      bg: 'bg-red-50',
      fg: 'text-red-600',
      title: `오류 · ${e.mallName}`,
      sub: `${e.message} · ${shortTime(e.at)}`,
    };
  }
  return {
    icon: <Inbox size={15} />,
    bg: 'bg-slate-100',
    fg: 'text-slate-400',
    title: `신규 주문 없음 · ${e.mallName}`,
    sub: shortTime(e.at),
  };
}

function activityMeta(item: StoredOrderCollectionFile): ActivityMeta {
  const orders = getHistoryOrderCount(item) ?? 0;
  const mall = item.mallName ?? '주문';

  if (item.transmissionRequestedAt !== undefined) {
    return {
      icon: <Send size={15} />,
      bg: 'bg-emerald-50',
      fg: 'text-emerald-600',
      title: `셀피아 전송 요청 · ${mall}`,
      sub: `${formatNumber(orders)}건 · ${shortTime(item.transmissionRequestedAt)}`,
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

function shortTime(timestamp: number): string {
  const value = new Date(timestamp);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}
