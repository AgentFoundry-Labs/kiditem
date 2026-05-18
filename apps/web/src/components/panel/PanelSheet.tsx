'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArchiveX, Bell, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { isActivePanelItem, usePanelStore } from './lib/panel-store';
import { recoverStalePanelOperations } from './lib/panel-recovery';
import { PanelItemRow } from './PanelItemRow';
import type { PanelItem } from '@kiditem/shared/panel';

export function PanelSheet() {
  const [isClearing, setIsClearing] = useState(false);
  const isOpen = usePanelStore((s) => s.isOpen);
  const setOpen = usePanelStore((s) => s.setOpen);
  const byId = usePanelStore((s) => s.byId);
  const dismissItem = usePanelStore((s) => s.dismissItem);
  const connectionStatus = usePanelStore((s) => s.connectionStatus);
  const recoveryLastRunRef = useRef(0);
  const recoveryInFlightRef = useRef(false);

  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  // byId ref만 의존하면 안정적 — Object.values()를 selector 안에서 호출하면
  // 매 렌더 새 배열 레퍼런스로 infinite loop (useSyncExternalStore getSnapshot 경고).
  const { active, recent, runningCount } = useMemo(
    () => partitionByStatus(Object.values(byId)),
    [byId],
  );
  const dismissableAlerts = useMemo(
    () => [...active, ...recent].filter(isDismissablePanelAlert),
    [active, recent],
  );

  const { myItems, attentionItems, teamItems } = useMemo(
    () => partitionPanelItems([...active, ...recent], currentUserId),
    [active, recent, currentUserId],
  );

  useEffect(() => {
    if (!isOpen) return;
    const now = Date.now();
    if (recoveryInFlightRef.current || now - recoveryLastRunRef.current < 30_000) {
      return;
    }
    recoveryInFlightRef.current = true;
    recoveryLastRunRef.current = now;
    const afterSeq = usePanelStore.getState().lastSeq;
    void recoverStalePanelOperations(afterSeq)
      .then((items) => {
        usePanelStore.getState().handleSnapshot(items, true);
      })
      .catch((err) => {
        console.warn('[panel] stale operation recovery failed', err);
      })
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

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/10" />
        <Dialog.Content className="fixed right-0 top-0 z-[110] h-full w-96 bg-white border-l border-slate-200 shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200">
            <Dialog.Title className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-500" />
              알림
            </Dialog.Title>
            <div className="flex items-center gap-1.5">
              {runningCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">
                  <span className="w-1 h-1 bg-violet-500 rounded-full animate-pulse" />
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
                  <ArchiveX className="w-3 h-3" />
                  완료 정리
                </button>
              )}
              <button
                type="button"
                aria-label="알림 패널 닫기"
                onClick={() => setOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <Dialog.Description className="sr-only">
            진행 중인 작업과 최근 알림을 확인하고 정리합니다.
          </Dialog.Description>

          {connectionStatus !== 'connected' && (
            <div className="px-4 py-1.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
              {connectionStatus === 'connecting' && '연결 중...'}
              {connectionStatus === 'disconnected' && '연결 끊김 — 재시도 중'}
              {connectionStatus === 'polling_fallback' && '폴링 모드'}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {/* 내 작업 section */}
            <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
              내 작업
            </div>
            {myItems.length > 0
              ? myItems.map((i) => <PanelItemRow key={i.id} item={i} />)
              : (
                <div className="px-4 py-6 text-center text-sm text-slate-400">
                  진행 중인 내 작업이 없습니다
                </div>
              )}

            {/* 조직 알림 section — 조직/시스템 알림을 팀 작업과 분리 */}
            <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
              조직 알림
            </div>
            {attentionItems.length > 0
              ? attentionItems.map((i) => <PanelItemRow key={i.id} item={i} />)
              : (
                <div className="px-4 py-6 text-center text-sm text-slate-400">
                  조직 알림이 없습니다
                </div>
              )}

            {/* 팀 작업 section — empty 시 헤더도 숨김 */}
            {teamItems.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                  팀 작업
                </div>
                {teamItems.map((i) => <PanelItemRow key={i.id} item={i} />)}
              </>
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
  // 시간 역순
  active.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { active, recent, runningCount };
}

function isDismissablePanelAlert(item: PanelItem) {
  return item.kind === 'alert' && !isActivePanelItem(item);
}

function partitionPanelItems(items: PanelItem[], currentUserId: string | null) {
  const myItems: PanelItem[] = [];
  const attentionItems: PanelItem[] = [];
  const teamItems: PanelItem[] = [];
  for (const item of items) {
    if (currentUserId !== null && item.actorUserId === currentUserId) {
      myItems.push(item);
    } else if (isAttentionPanelItem(item)) {
      attentionItems.push(item);
    } else {
      teamItems.push(item);
    }
  }
  return { myItems, attentionItems, teamItems };
}

function isAttentionPanelItem(item: PanelItem) {
  return item.kind === 'alert' && item.actorUserId === null;
}
