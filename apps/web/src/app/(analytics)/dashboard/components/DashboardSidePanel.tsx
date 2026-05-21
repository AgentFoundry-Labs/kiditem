import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { QueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Loader2,
  Megaphone,
  MinusCircle,
  ShieldCheck,
  Square,
  Truck,
} from 'lucide-react';
import { type DashboardAlertItem } from '@kiditem/shared/dashboard';
import type { PanelAlertItem } from '@kiditem/shared/panel';
import { usePanelStore } from '@/components/panel/lib/panel-store';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { cancelOperation } from '@/lib/operation-cancellation';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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

function isActiveOperation(alert: DashboardAlertItem): boolean {
  return alert.kind === 'operation' && (alert.status === 'running' || alert.status === 'pending');
}

function operationKeyOf(alert: DashboardAlertItem): string | null {
  const value = (alert as DashboardAlertItem & { operationKey?: string | null }).operationKey;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isPanelAlertItem(item: unknown): item is PanelAlertItem {
  return typeof item === 'object' && item !== null && (item as { kind?: unknown }).kind === 'alert';
}

function dashboardAlertFromPanelAlert(item: PanelAlertItem): DashboardAlertItem {
  return {
    id: item.id,
    kind: item.alertKind,
    status: item.status,
    type: item.type,
    severity: item.severity,
    title: item.title,
    message: item.message,
    operationKey: item.operationKey,
    sourceType: item.sourceType,
    href: item.href,
    progress: item.progress,
    targetType: item.targetType,
    targetId: item.targetId,
    isRead: item.isRead,
    createdAt: item.createdAt,
  };
}

function DashboardAlertRow({
  alert,
  queryClient,
}: {
  alert: DashboardAlertItem;
  queryClient: QueryClient;
}) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const href = alert.href ?? (alert.type === 'strategy_change' ? '/ad-ops' : alert.type === 'stock_low' ? '/purchase-orders' : alert.type === 'minus_product' ? '/cleanup' : alert.type === 'ad_high' ? '/ads-hub' : undefined);
  const statusLabel = alert.kind === 'operation' ? alertStatusLabel(alert.status) : null;
  const operationKey = operationKeyOf(alert);
  const canCancel = isActiveOperation(alert) && operationKey != null;
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
  const rowClass = cn('group flex items-start gap-2.5 px-4 py-2.5 border-b border-slate-50 transition-colors', href && 'hover:bg-slate-50');
  const contentClass = cn('flex min-w-0 flex-1 items-start gap-2.5', href && 'cursor-pointer');

  const requestCancel = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!operationKey || isCancelling) return;
    setCancelConfirmOpen(true);
  };

  const confirmCancel = async () => {
    if (!operationKey || isCancelling) return;
    setIsCancelling(true);
    try {
      await cancelOperation({
        targetType: 'operation_key',
        operationKey,
        reason: '사용자 요청',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    } catch (error) {
      toast.error(isApiError(error) ? error.detail : '작업 중단 요청에 실패했습니다.');
    } finally {
      setIsCancelling(false);
      setCancelConfirmOpen(false);
    }
  };

  return (
    <>
      <div className={rowClass}>
        {href ? (
          <Link href={href} className={contentClass}>
            {content}
          </Link>
        ) : (
          <div className={contentClass}>{content}</div>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={requestCancel}
            disabled={isCancelling}
            aria-label="작업 중단"
            title="작업 중단"
            className={cn(
              'mt-0.5 shrink-0 rounded border border-slate-200 p-1 text-slate-400 transition',
              'opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-slate-50 hover:text-red-600',
              isCancelling && 'cursor-wait opacity-100',
            )}
          >
            {isCancelling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Square className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="작업을 중단할까요?"
        description="이미 완료된 결과는 유지하고, 아직 진행 중인 실행만 중단합니다."
        confirmText="중단"
        cancelText="계속 실행"
        tone="danger"
        isLoading={isCancelling}
        onConfirm={confirmCancel}
      />
    </>
  );
}

export function DashboardSidePanel({
  alerts,
  queryClient,
}: {
  alerts: DashboardAlertItem[];
  queryClient: QueryClient;
}) {
  const panelById = usePanelStore((state) => state.byId);
  const panelHasHydrated = usePanelStore((state) => state.hasHydrated);
  const upsertPanelItem = usePanelStore((state) => state.upsertItem);
  const panelAlertItems = useMemo(
    () => Object.values(panelById).filter(isPanelAlertItem),
    [panelById],
  );
  const panelAlerts = useMemo(
    () => panelAlertItems.map(dashboardAlertFromPanelAlert),
    [panelAlertItems],
  );
  const visibleAlerts = panelHasHydrated ? panelAlerts : alerts;
  const unreadCount = visibleAlerts.filter((alert) => !alert.isRead).length;

  const markAllRead = async () => {
    try {
      await apiClient.patch('/api/alerts/read-all', {});
      if (panelHasHydrated) {
        const readAt = new Date().toISOString();
        for (const item of panelAlertItems) {
          if (!item.isRead) {
            upsertPanelItem({ ...item, isRead: true, readAt });
          }
        }
      }
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
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs text-purple-600 font-semibold hover:underline">전체 읽음</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {visibleAlerts.map((alert) => (
          <DashboardAlertRow key={alert.id} alert={alert} queryClient={queryClient} />
        ))}
        {visibleAlerts.length === 0 && (
          <div className="px-4 py-8 text-center">
            <ShieldCheck size={24} className="mx-auto mb-2 text-emerald-500" />
            <div className="text-xs text-slate-400">표시할 알림이 없습니다</div>
          </div>
        )}
      </div>
    </div>
  );
}
