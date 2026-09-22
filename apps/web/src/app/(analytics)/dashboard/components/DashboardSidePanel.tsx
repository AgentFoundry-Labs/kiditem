import Link from 'next/link';
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useDismissAlert } from '@/lib/alerts-api';
import { cn } from '@/lib/utils';
import type { DashboardAlertItem } from '@kiditem/shared/dashboard';

/**
 * One alert type is ever written and read: `source_failure`. This branched on
 * four others — `minus_product`, `ad_high`, `stock_low`,
 * `strategy_change` — which appear nowhere in the server. Three of them name a
 * **Warning**, a standing count of products currently in a bad state, which the
 * glossary says not to call an alert.
 */
function alertIcon() {
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

/**
 * A dashboard read that failed, which is a notification like any other: it needs
 * attention and it has one action. It used to be a red block across the top of
 * the page, which put a partial read failure above everything that did load.
 *
 * It says the read's name and nothing else. A reason a person cannot act on is
 * not worth a line — the schema-drift sentinel literally reads "개발팀에
 * 문의하세요", which is a message for us, not for whoever is looking at this.
 */
export type DashboardReadFailure = {
  key: string;
  label: string;
  retry: () => void;
};

function DashboardReadFailureRow({ failure }: { failure: DashboardReadFailure }) {
  return (
    <div
      className="group flex items-start gap-2.5 border-b border-slate-50 px-4 py-2.5"
      data-testid="dashboard-read-failure"
      data-read-failure={failure.label}
    >
      <div className="mt-0.5">
        <AlertTriangle size={14} className="shrink-0 text-red-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium leading-relaxed text-slate-700">{failure.label}</span>
          <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
            읽기 실패
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label="다시 시도"
        title="다시 시도"
        onClick={failure.retry}
        className="shrink-0 rounded border border-slate-200 p-1 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

function DashboardAlertRow({ alert }: { alert: DashboardAlertItem }) {
  const dismissMutation = useDismissAlert();
  // The source owner names where to send the operator. The fallbacks here keyed
  // off types nothing writes, so they never fired.
  const href = alert.href ?? undefined;
  const open = isOpenAlert(alert);
  const dismiss = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // Which surfaces have to reconcile is the hook's answer, not this row's.
    // A failure needs no branch here: the next poll reconciles the row.
    dismissMutation.mutate(alert.id);
  };
  const content = (
    <>
      <div className="mt-0.5">{open ? alertIcon() : <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium leading-relaxed text-slate-700">{alert.title}</span>
          {!alert.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-label="읽지 않음" />}
          {alertStatusLabel(alert.status) && (
            <span className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
              open ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
            )}>
              {alertStatusLabel(alert.status)}
            </span>
          )}
        </div>
        {alert.message && <div className="mt-0.5 truncate text-[13px] text-slate-500">{alert.message}</div>}
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
  readFailures = [],
}: {
  alerts: DashboardAlertItem[];
  readFailures?: readonly DashboardReadFailure[];
}) {
  // A failed read needs attention the same way an open alert does, so it counts.
  const unreadCount = alerts.filter((alert) => !alert.isRead && isOpenAlert(alert)).length
    + readFailures.length;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <AlertTriangle size={13} className="text-slate-500" />
        <span className="text-sm font-semibold text-slate-900">알림</span>
        {unreadCount > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">{unreadCount}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {readFailures.map((failure) => (
          <DashboardReadFailureRow key={failure.key} failure={failure} />
        ))}
        {alerts.map((alert) => <DashboardAlertRow key={alert.id} alert={alert} />)}
        {alerts.length === 0 && readFailures.length === 0 && (
          <div className="px-4 py-8 text-center">
            <ShieldCheck size={24} className="mx-auto mb-2 text-emerald-500" />
            <div className="text-[13px] text-slate-400">표시할 알림이 없습니다</div>
          </div>
        )}
      </div>
    </div>
  );
}
