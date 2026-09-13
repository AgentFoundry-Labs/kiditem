'use client';

import { useEffect } from 'react';
import { Bell, CheckCircle2, CircleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  unreadOpenAlertCount,
  useAlertsQuery,
  useDismissAlert,
  type AlertRecord,
} from '@/lib/alerts-api';

export function AlertsPopover() {
  const alertsQuery = useAlertsQuery();
  const dismissMutation = useDismissAlert();
  useEffect(() => {
    if (dismissMutation.isError) toast.error('알림을 닫지 못했습니다.');
  }, [dismissMutation.isError]);

  const alerts = alertsQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5 pr-14">
        <Bell className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <h2
          data-right-auxiliary-heading
          tabIndex={-1}
          className="text-sm font-semibold text-slate-900 outline-none"
        >
          알림
        </h2>
        {unreadOpenAlertCount(alerts) > 0 && (
          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
            {unreadOpenAlertCount(alerts)}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {alertsQuery.isLoading && (
          <p className="px-4 py-8 text-center text-sm text-slate-400">알림을 불러오는 중입니다.</p>
        )}
        {alertsQuery.isError && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            <p role="alert">알림을 불러오지 못했습니다.</p>
            <button
              type="button"
              onClick={() => void alertsQuery.refetch()}
              className="mt-3 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              다시 시도
            </button>
          </div>
        )}
        {!alertsQuery.isLoading && !alertsQuery.isError && alerts.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            표시할 알림이 없습니다
          </div>
        )}
        {!alertsQuery.isLoading && !alertsQuery.isError && alerts.map((alert) => (
          <AlertRow
            key={alert.id}
            alert={alert}
            isDismissing={dismissMutation.isPending && dismissMutation.variables === alert.id}
            onDismiss={() => dismissMutation.mutate(alert.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AlertRow({
  alert,
  isDismissing,
  onDismiss,
}: {
  alert: AlertRecord;
  isDismissing: boolean;
  onDismiss(): void;
}) {
  const open = isOpenAlert(alert);
  const content = (
    <>
      {open ? (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-700">{alert.title}</span>
          {!alert.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-label="읽지 않음" />}
        </div>
        {alert.message && <p className="mt-0.5 truncate text-xs text-slate-500">{alert.message}</p>}
        {!open && <p className="mt-0.5 text-[11px] text-emerald-600">해결됨</p>}
      </div>
    </>
  );

  return (
    <div className="group flex items-start gap-2.5 border-b border-slate-50 px-4 py-2.5">
      {alert.href ? (
        <a href={alert.href} className="flex min-w-0 flex-1 items-start gap-2.5 hover:underline">
          {content}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-2.5">{content}</div>
      )}
      {open && (
        <button
          type="button"
          aria-label="알림 닫기"
          title="알림 닫기"
          onClick={onDismiss}
          disabled={isDismissing}
          className="shrink-0 rounded border border-slate-200 p-1 text-slate-400 opacity-0 transition hover:bg-slate-50 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100 disabled:cursor-wait disabled:opacity-60"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function isOpenAlert(alert: AlertRecord): boolean {
  return alert.status === 'OPEN';
}

export default AlertsPopover;
