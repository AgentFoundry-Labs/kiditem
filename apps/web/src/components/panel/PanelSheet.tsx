'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArchiveX, Bell, EyeOff, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isActivePanelItem, usePanelStore } from './lib/panel-store';
import { recoverStalePanelOperations } from './lib/panel-recovery';
import { PanelItemRow } from './PanelItemRow';
import type { PanelItem } from '@kiditem/shared/panel';

export function PanelSheet() {
  const [isClearing, setIsClearing] = useState(false);
  const isOpen = usePanelStore((s) => s.isOpen);
  const setOpen = usePanelStore((s) => s.setOpen);
  const byId = usePanelStore((s) => s.byId);
  const hiddenRunIds = usePanelStore((s) => s.hiddenRunIds);
  const dismissItem = usePanelStore((s) => s.dismissItem);
  const hideRunItems = usePanelStore((s) => s.hideRunItems);
  const restoreHiddenRunItems = usePanelStore((s) => s.restoreHiddenRunItems);
  const connectionStatus = usePanelStore((s) => s.connectionStatus);
  const recoveryLastRunRef = useRef(0);
  const recoveryInFlightRef = useRef(false);

  const { active, recent, runningCount } = useMemo(
    () => partitionByStatus(Object.values(byId)),
    [byId],
  );
  const dismissableAlerts = useMemo(
    () => [...active, ...recent].filter(isDismissablePanelAlert),
    [active, recent],
  );
  const activeWorkflowRuns = useMemo(
    () => active.filter((item) => item.kind === 'run'),
    [active],
  );
  const visibleItems = [...active, ...recent];
  const hiddenRunCount = Object.keys(hiddenRunIds).length;

  useEffect(() => {
    if (!isOpen) return;
    const now = Date.now();
    if (recoveryInFlightRef.current || now - recoveryLastRunRef.current < 30_000) return;
    recoveryInFlightRef.current = true;
    recoveryLastRunRef.current = now;
    const afterSeq = usePanelStore.getState().lastSeq;
    void recoverStalePanelOperations(afterSeq)
      .then((items) => usePanelStore.getState().handleSnapshot(items, true))
      .catch((err) => console.warn('[panel] stale operation recovery failed', err))
      .finally(() => {
        recoveryInFlightRef.current = false;
      });
  }, [connectionStatus, isOpen]);

  const clearDismissableAlerts = async () => {
    if (isClearing || dismissableAlerts.length === 0) return;
    setIsClearing(true);
    try {
      const results = await Promise.allSettled(
        dismissableAlerts.map(async (item) => {
          await apiClient.post(`/api/alerts/${encodeURIComponent(item.id)}/dismiss`);
          dismissItem(item.id);
        }),
      );
      if (results.some((result) => result.status === 'rejected')) {
        console.warn('[panel] failed to clear some alerts');
      }
    } finally {
      setIsClearing(false);
    }
  };

  const hideActiveWorkflowRuns = () => {
    if (activeWorkflowRuns.length === 0) return;
    hideRunItems(activeWorkflowRuns.map((item) => item.id));
    toast.success(`${activeWorkflowRuns.length}개의 진행 중 워크플로우를 화면에서 숨겼습니다.`);
  };

  const restoreHiddenWorkflowRuns = async () => {
    restoreHiddenRunItems();
    try {
      const items = await apiClient.get<PanelItem[]>('/api/panel/snapshot');
      usePanelStore.getState().handleSnapshot(items, true);
      toast.success('숨긴 워크플로우를 다시 표시했습니다.');
    } catch (error) {
      console.warn('[panel] failed to restore hidden workflow runs', error);
      toast.error('숨긴 워크플로우를 다시 불러오지 못했습니다.');
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/10" />
        <Dialog.Content className="fixed right-0 top-0 z-[110] flex h-full w-96 flex-col border-l border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Bell className="h-4 w-4 text-slate-500" />
              알림
            </Dialog.Title>
            <div className="flex items-center gap-1.5">
              {runningCount > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-violet-500" />
                  {runningCount} 진행
                </span>
              )}
              {dismissableAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={clearDismissableAlerts}
                  disabled={isClearing}
                  aria-label="완료 알림 정리"
                  title="완료 알림 정리"
                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArchiveX className="h-3 w-3" />
                  완료 정리
                </button>
              )}
              {activeWorkflowRuns.length > 0 && (
                <button
                  type="button"
                  onClick={hideActiveWorkflowRuns}
                  aria-label="진행 중 워크플로우 화면에서 정리"
                  title="실제 실행은 중단하지 않고 이 브라우저의 알림 화면에서만 숨깁니다"
                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                >
                  <EyeOff className="h-3 w-3" />
                  진행 정리
                </button>
              )}
              {hiddenRunCount > 0 && (
                <button
                  type="button"
                  onClick={() => void restoreHiddenWorkflowRuns()}
                  aria-label="숨긴 워크플로우 다시 표시"
                  title="숨긴 워크플로우 다시 표시"
                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                >
                  <RotateCcw className="h-3 w-3" />
                  복원
                </button>
              )}
              <button
                type="button"
                aria-label="알림 패널 닫기"
                onClick={() => setOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <Dialog.Description className="sr-only">
            진행 중인 작업과 최근 알림을 한 목록에서 확인하고 정리합니다.
          </Dialog.Description>

          {connectionStatus !== 'connected' && (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-700">
              {connectionStatus === 'connecting' && '연결 중...'}
              {connectionStatus === 'disconnected' && '연결 끊김 — 재시도 중'}
              {connectionStatus === 'polling_fallback' && '폴링 모드'}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {visibleItems.map((item) => <PanelItemRow key={item.id} item={item} />)}
            {visibleItems.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                표시할 알림이 없습니다
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function partitionByStatus(items: PanelItem[]) {
  const active: PanelItem[] = [];
  const recent: PanelItem[] = [];
  let runningCount = 0;
  for (const item of items) {
    if (isActivePanelItem(item)) {
      active.push(item);
      runningCount++;
    } else {
      recent.push(item);
    }
  }
  active.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { active, recent, runningCount };
}

function isDismissablePanelAlert(item: PanelItem) {
  return item.kind === 'alert' && !isActivePanelItem(item);
}
