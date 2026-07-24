'use client';

import { Bell } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';

export type ShipmentNotificationStatus = 'started' | 'succeeded' | 'failed' | 'info';

export interface ShipmentNotification {
  id: string;
  status: ShipmentNotificationStatus;
  message: string;
  at: number;
}

const STATUS_META: Record<ShipmentNotificationStatus, { label: string; className: string }> = {
  started: { label: '진행', className: 'bg-blue-50 text-blue-700' },
  succeeded: { label: '완료', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '실패', className: 'bg-rose-50 text-rose-700' },
  info: { label: '안내', className: 'bg-slate-100 text-slate-600' },
};

/** 쿠팡 쉽먼트 · 조회/수집·병합 활동 알림 패널 (쿠팡 로켓 작업 알림과 동일 구조). */
export function ShipmentNotifications({ notifications }: { notifications: ShipmentNotification[] }) {
  return (
    <aside className="h-full rounded-xl border border-slate-200 bg-white p-4 xl:col-span-1">
      <div className="flex items-center gap-1.5">
        <Bell size={15} className="text-purple-600" />
        <h2 className="text-sm font-bold text-slate-900">알림</h2>
      </div>
      <div role="log" aria-live="polite" className="mt-3 max-h-[440px] space-y-2 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="text-xs leading-5 text-slate-400">
            발송일 조회·수집·병합 활동이 여기에 표시됩니다.
          </p>
        ) : (
          notifications.map((notification) => {
            const meta = STATUS_META[notification.status];
            return (
              <div key={notification.id} className="rounded-lg border border-slate-100 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', meta.className)}>
                    {meta.label}
                  </span>
                  <time className="text-[10px] tabular-nums text-slate-400">
                    {formatTime(notification.at)}
                  </time>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{notification.message}</p>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
