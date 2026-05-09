'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Info, AlertTriangle, AlertCircle, XCircle, Bell,
  Loader2, CheckCircle2, Ban, ExternalLink, X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn, timeAgo } from '@/lib/utils';
import { PromoteToTaskModal } from './PromoteToTaskModal';
import { usePanelStore } from './lib/panel-store';
import type { PanelAlertItem } from '@kiditem/shared/panel';

function severityIcon(severity: string) {
  switch (severity) {
    case 'info': return { Icon: Info, colorClass: 'text-blue-500 bg-blue-50' };
    case 'warning': return { Icon: AlertTriangle, colorClass: 'text-amber-500 bg-amber-50' };
    case 'error': return { Icon: AlertCircle, colorClass: 'text-red-500 bg-red-50' };
    case 'critical': return { Icon: XCircle, colorClass: 'text-red-700 bg-red-100' };
    default: return { Icon: Bell, colorClass: 'text-slate-500 bg-slate-100' };
  }
}

/**
 * Operation status badge config.
 *
 * Operation alerts (Alert.kind = 'operation') represent user-triggered
 * long-running work — the lifecycle ledger introduced in PR #209.
 * `signal` alerts (broadcast warnings/info) skip this badge entirely.
 */
function operationStatusBadge(status: string): { label: string; className: string; Icon: typeof Loader2 } | null {
  switch (status) {
    case 'running':
    case 'pending':
      return {
        label: status === 'pending' ? '대기 중' : '진행 중',
        className: 'bg-blue-50 text-blue-600',
        Icon: Loader2,
      };
    case 'succeeded':
      return { label: '완료', className: 'bg-emerald-50 text-emerald-600', Icon: CheckCircle2 };
    case 'failed':
      return { label: '실패', className: 'bg-red-50 text-red-600', Icon: XCircle };
    case 'cancelled':
      return { label: '취소', className: 'bg-slate-100 text-slate-500', Icon: Ban };
    case 'resolved':
      return { label: '해결', className: 'bg-slate-100 text-slate-500', Icon: CheckCircle2 };
    default:
      return null;
  }
}

export function PanelAlertRow({ item }: { item: PanelAlertItem }) {
  const { Icon, colorClass } = severityIcon(item.severity);
  const [modalOpen, setModalOpen] = useState(false);
  const setPanelOpen = usePanelStore((s) => s.setOpen);
  const dismissItem = usePanelStore((s) => s.dismissItem);

  const isOperation = item.alertKind === 'operation';
  const badge = isOperation ? operationStatusBadge(item.status) : null;
  const showProgress =
    isOperation &&
    (item.status === 'running' || item.status === 'pending') &&
    typeof item.progress === 'number';
  // Promote-to-task only makes sense for terminal/open signals or terminal
  // operations. Surfacing it on a still-running operation would create an
  // orphaned task whose context (success/fail/cancel) is not yet known.
  const canPromote =
    item.actionTaskId == null && (!isOperation || item.status !== 'running');
  const canDismiss =
    !isOperation || (item.status !== 'running' && item.status !== 'pending');

  const dismiss = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await apiClient.post(`/api/alerts/${encodeURIComponent(item.id)}/dismiss`);
      dismissItem(item.id);
    } catch (err) {
      console.warn('[panel] dismiss alert failed', err);
    }
  };

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
          {badge && (
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                  badge.className,
                )}
                aria-label={`상태: ${badge.label}`}
              >
                <badge.Icon
                  className={cn(
                    'w-3 h-3',
                    item.status === 'running' && 'animate-spin',
                  )}
                />
                {badge.label}
              </span>
              {item.sourceType && (
                <span className="text-[10px] text-slate-400">{item.sourceType}</span>
              )}
            </div>
          )}
          {showProgress && (
            <div
              className="mt-1 h-1 w-full bg-slate-100 rounded overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round((item.progress ?? 0) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-blue-500 transition-[width]"
                style={{ width: `${Math.max(0, Math.min(1, item.progress ?? 0)) * 100}%` }}
              />
            </div>
          )}
          {item.message && (
            <div className="text-xs text-slate-500 mt-0.5 truncate">{item.message}</div>
          )}
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-xs text-slate-400">{timeAgo(item.createdAt)}</div>
              {item.href && (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-0.5 text-xs text-purple-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPanelOpen(false);
                  }}
                >
                  <span>이동</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canPromote ? (
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
              ) : item.actionTaskId != null ? (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  ← 할 일 목록에 있음
                </span>
              ) : null}
              {canDismiss && (
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="알림 정리"
                  title="알림 정리"
                  className={cn(
                    'opacity-0 group-hover:opacity-100 focus:opacity-100 transition',
                    'p-1 rounded border border-gray-300 text-slate-400 hover:bg-gray-50 hover:text-slate-600',
                  )}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
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
