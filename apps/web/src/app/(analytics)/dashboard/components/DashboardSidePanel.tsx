import Link from 'next/link';
import type { QueryClient } from '@tanstack/react-query';
import { AlertTriangle, Megaphone, MinusCircle, ShieldCheck, Truck } from 'lucide-react';
import { type DashboardAlertItem } from '@kiditem/shared/dashboard';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

function alertIcon(type: string) {
  if (type === 'minus_product') return <MinusCircle size={14} className="text-red-500 shrink-0" />;
  if (type === 'ad_high') return <Megaphone size={14} className="text-amber-500 shrink-0" />;
  if (type === 'stock_low') return <Truck size={14} className="text-blue-500 shrink-0" />;
  return <AlertTriangle size={14} className="text-slate-400 shrink-0" />;
}

function alertStatusLabel(status: DashboardAlertItem['status']): string | null {
  if (status === 'running') return '진행 중';
  if (status === 'pending') return '대기 중';
  if (status === 'succeeded') return '완료';
  if (status === 'failed') return '실패';
  if (status === 'cancelled') return '취소';
  if (status === 'resolved') return '해결';
  return null;
}

function alertStatusClass(status: DashboardAlertItem['status']): string {
  if (status === 'succeeded') return 'bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'bg-red-50 text-red-700';
  if (status === 'running' || status === 'pending') return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

export function DashboardSidePanel({
  alerts,
  queryClient,
}: {
  alerts: DashboardAlertItem[];
  queryClient: QueryClient;
}) {
  const markAllRead = async () => {
    try {
      await apiClient.patch('/api/alerts/read-all', {});
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    } catch {
      // Best-effort notification cleanup. The panel refreshes on the next poll.
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full bg-white border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={14} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">알림</span>
          {alerts.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{alerts.length}</span>
          )}
        </div>
        {alerts.length > 0 && (
          <button onClick={markAllRead} className="text-xs text-purple-600 font-semibold hover:underline">전체 읽음</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {alerts.map((alert) => {
          const href = alert.href ?? (alert.type === 'strategy_change' ? '/ad-ops' : alert.type === 'stock_low' ? '/purchase-orders' : alert.type === 'minus_product' ? '/cleanup' : alert.type === 'ad_high' ? '/ads-hub' : undefined);
          const statusLabel = alert.kind === 'operation' ? alertStatusLabel(alert.status) : null;
          const content = (
            <>
              <div className="mt-0.5">{alertIcon(alert.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium leading-relaxed text-slate-700 truncate">{alert.title}</span>
                  {statusLabel && (
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', alertStatusClass(alert.status))}>
                      {statusLabel}
                    </span>
                  )}
                  {href && <span className="text-[10px] text-purple-600">→</span>}
                </div>
                {alert.message && (
                  <div className="mt-0.5 truncate text-xs text-slate-500">{alert.message}</div>
                )}
              </div>
            </>
          );
          const rowClass = cn('flex items-start gap-2.5 px-4 py-2.5 border-b border-slate-50 transition-colors', href && 'cursor-pointer hover:bg-slate-50');
          return href ? (
            <Link key={alert.id} href={href} className={rowClass}>
              {content}
            </Link>
          ) : (
            <div key={alert.id} className={rowClass}>
              {content}
            </div>
          );
        })}
        {alerts.length === 0 && (
          <div className="px-4 py-8 text-center">
            <ShieldCheck size={24} className="mx-auto mb-2 text-emerald-500" />
            <div className="text-xs text-slate-400">모든 알림을 확인했습니다</div>
          </div>
        )}
      </div>
    </div>
  );
}
