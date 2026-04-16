'use client';

import { useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Bell, X } from 'lucide-react';
import { usePanelStore } from './lib/panel-store';
import { PanelItemRow } from './PanelItemRow';
import type { PanelItem } from '@kiditem/shared';

export function PanelSheet() {
  const isOpen = usePanelStore((s) => s.isOpen);
  const setOpen = usePanelStore((s) => s.setOpen);
  const byId = usePanelStore((s) => s.byId);
  const connectionStatus = usePanelStore((s) => s.connectionStatus);

  // Read at render time so test env stubs (vi.stubEnv) are picked up.
  const currentUserId = process.env.NEXT_PUBLIC_DEV_USER_ID ?? null;

  // byId ref만 의존하면 안정적 — Object.values()를 selector 안에서 호출하면
  // 매 렌더 새 배열 레퍼런스로 infinite loop (useSyncExternalStore getSnapshot 경고).
  const { active, recent, runningCount } = useMemo(
    () => partitionByStatus(Object.values(byId)),
    [byId],
  );

  const { myItems, teamItems } = useMemo(
    () => partitionByOwner([...active, ...recent], currentUserId),
    [active, recent, currentUserId],
  );

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/10" />
        <Dialog.Content className="fixed right-0 top-0 h-full w-96 bg-white border-l border-slate-200 shadow-xl flex flex-col">
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
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

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

            {/* 팀 section — empty 시 헤더도 숨김 */}
            {teamItems.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                  팀
                </div>
                {teamItems.map((i) => <PanelItemRow key={i.id} item={i} />)}
              </>
            )}

            {myItems.length === 0 && teamItems.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                현재 주목할 항목이 없어요
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
    const isActive = item.kind === 'run' && (item.status === 'pending' || item.status === 'running');
    if (isActive) {
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

function partitionByOwner(items: PanelItem[], currentUserId: string | null) {
  const myItems: PanelItem[] = [];
  const teamItems: PanelItem[] = [];
  for (const item of items) {
    if (currentUserId !== null && item.actorUserId === currentUserId) {
      myItems.push(item);
    } else {
      teamItems.push(item);
    }
  }
  return { myItems, teamItems };
}
