'use client';

import { useState } from 'react';
import { Info, AlertTriangle, AlertCircle, XCircle, Bell } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { PromoteToTaskModal } from './PromoteToTaskModal';
import type { PanelAlertItem } from '@kiditem/shared';

function severityIcon(severity: string) {
  switch (severity) {
    case 'info': return { Icon: Info, colorClass: 'text-blue-500 bg-blue-50' };
    case 'warning': return { Icon: AlertTriangle, colorClass: 'text-amber-500 bg-amber-50' };
    case 'error': return { Icon: AlertCircle, colorClass: 'text-red-500 bg-red-50' };
    case 'critical': return { Icon: XCircle, colorClass: 'text-red-700 bg-red-100' };
    default: return { Icon: Bell, colorClass: 'text-slate-500 bg-slate-100' };
  }
}

export function PanelAlertRow({ item }: { item: PanelAlertItem }) {
  const { Icon, colorClass } = severityIcon(item.severity);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          'group w-full flex items-start gap-2.5 px-4 py-3 border-b border-slate-50',
          !item.isRead && 'bg-blue-50/30',
        )}
      >
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', colorClass)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-slate-900 truncate">{item.title}</span>
            {!item.isRead && (
              <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1" aria-label="읽지 않음" />
            )}
          </div>
          {item.message && (
            <div className="text-xs text-slate-500 mt-0.5 truncate">{item.message}</div>
          )}
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <div className="text-xs text-slate-400">{timeAgo(item.createdAt)}</div>
            {item.actionTaskId == null ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
                aria-label="할 일로 만들기"
                className={cn(
                  'opacity-0 group-hover:opacity-100 focus:opacity-100 transition',
                  'text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50',
                )}
              >
                할 일로 만들기
              </button>
            ) : (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                ← 할 일 목록에 있음
              </span>
            )}
          </div>
        </div>
      </div>
      {modalOpen && (
        <PromoteToTaskModal
          alert={item}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
