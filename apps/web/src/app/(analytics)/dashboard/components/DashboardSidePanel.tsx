import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Megaphone, MinusCircle, ShieldCheck, Truck, X } from 'lucide-react';
import { dismissAlert } from '@/lib/alerts-api';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { DashboardMetricBasis } from './DashboardDataBasis';
import type { QueryClient } from '@tanstack/react-query';
import type { DashboardAlertItem } from '@kiditem/shared/dashboard';

function alertIcon(type: string) {
  if (type === 'minus_product') return <MinusCircle size={14} className="shrink-0 text-red-500" />;
  if (type === 'ad_high') return <Megaphone size={14} className="shrink-0 text-amber-500" />;
  if (type === 'stock_low') return <Truck size={14} className="shrink-0 text-blue-500" />;
  return <AlertTriangle size={14} className="shrink-0 text-slate-400" />;
}

function isOpenAlert(alert: DashboardAlertItem): boolean {
  return isOpenAlertStatus(alert.status);
}

function isOpenAlertStatus(status: DashboardAlertItem['status']): boolean {
  return status === 'OPEN';
}

function alertStatusLabel(status: DashboardAlertItem['status']): string | null {
  if (isOpenAlertStatus(status)) return '확인 필요';
  if (status === 'RESOLVED') return '해결됨';
  return null;
}

function DashboardAlertRow({
  alert,
  queryClient,
}: {
  alert: DashboardAlertItem;
  queryClient: QueryClient;
}) {
  const href = alert.href ?? (
    alert.type === 'strategy_change'
      ? '/ad-ops'
      : alert.type === 'stock_low'
        ? '/inventory-hub'
        : alert.type === 'minus_product'
          ? '/product-hub?tab=cleanup'
          : alert.type === 'ad_high'
            ? '/ad-ops'
            : undefined
  );
  const open = isOpenAlert(alert);
  const dismiss = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await dismissAlert(alert.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      ]);
    } catch {
      // The next normal dashboard or alert query will reconcile the row.
    }
  };
  const content = (
    <>
      <div className="mt-0.5">{open ? alertIcon(alert.type) : <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium leading-relaxed text-slate-700">{alert.title}</span>
          {!alert.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-label="읽지 않음" />}
          {alertStatusLabel(alert.status) && (
            <span className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
              open ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
            )}>
              {alertStatusLabel(alert.status)}
            </span>
          )}
        </div>
        {alert.message && <div className="mt-0.5 truncate text-xs text-slate-500">{alert.message}</div>}
      </div>
    </>
  );

  return (
    <div className="group flex items-start gap-2.5 border-b border-slate-50 px-4 py-2.5">
      {href ? <Link href={href} className="flex min-w-0 flex-1 items-start gap-2.5 hover:bg-slate-50">{content}</Link> : <div className="flex min-w-0 flex-1 items-start gap-2.5">{content}</div>}
      {open && (
        <button
          type="button"
          aria-label="알림 닫기"
          title="알림 닫기"
          onClick={(event) => void dismiss(event)}
          className="shrink-0 rounded border border-slate-200 p-1 text-slate-400 opacity-0 transition hover:bg-slate-50 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function DashboardSidePanel({
  alerts,
  queryClient,
  basis,
}: {
  alerts: DashboardAlertItem[];
  queryClient: QueryClient;
  basis?: DashboardMetricBasis | null;
}) {
  const unreadCount = alerts.filter((alert) => !alert.isRead && isOpenAlert(alert)).length;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <AlertTriangle size={13} className="text-slate-500" />
        <span className="text-sm font-semibold text-slate-900">알림</span>
        {unreadCount > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">{unreadCount}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {alerts.map((alert) => <DashboardAlertRow key={alert.id} alert={alert} queryClient={queryClient} />)}
        {alerts.length === 0 && (
          <div className="px-4 py-8 text-center">
            <ShieldCheck size={24} className="mx-auto mb-2 text-emerald-500" />
            <div className="text-xs text-slate-400">표시할 알림이 없습니다</div>
          </div>
        )}
      </div>
    </div>
  );
}
