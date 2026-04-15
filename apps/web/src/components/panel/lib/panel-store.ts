import { create } from 'zustand';
import type { PanelItem, PanelEvent } from '@kiditem/shared';

const PANEL_OPEN_LS_KEY = 'kiditem.panel.open';

const readOpenFromStorage = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(PANEL_OPEN_LS_KEY) === 'true';
  } catch {
    return false;
  }
};

interface PanelStoreState {
  byId: Record<string, PanelItem>;
  lastSeq: number;
  isOpen: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'polling_fallback';

  upsertItem: (item: PanelItem) => void;
  dismissItem: (id: string) => void;
  handleSnapshot: (items: PanelItem[], resetClient: boolean) => void;
  applyEvent: (event: PanelEvent) => void;
  setOpen: (open: boolean) => void;
  setConnectionStatus: (s: PanelStoreState['connectionStatus']) => void;

  // runningCount() 는 number 반환이라 selector에서 안전 (Object.is 비교).
  // itemsArray 같이 배열/객체 반환 함수는 store에 두지 않는다 — selector 안에서 호출 시
  // 매 렌더 새 레퍼런스로 useSyncExternalStore infinite loop 유발. 필요하면
  // 컴포넌트가 byId 구독 + useMemo로 파생.
  runningCount: () => number;
}

export const createPanelStore = () => create<PanelStoreState>((set, get) => ({
  byId: {},
  lastSeq: 0,
  isOpen: readOpenFromStorage(),
  connectionStatus: 'disconnected',

  upsertItem: (item) => set((state) => {
    const existing = state.byId[item.id];
    if (existing && existing.seq >= item.seq) return state;
    return { byId: { ...state.byId, [item.id]: item }, lastSeq: Math.max(state.lastSeq, item.seq) };
  }),

  dismissItem: (id) => set((state) => {
    const rest = { ...state.byId };
    delete rest[id];
    return { byId: rest };
  }),

  handleSnapshot: (items, _resetClient) => set(() => {
    // CRITICAL #9: PanelSnapshotEvent.resetClient는 z.literal(true) — 항상 true 고정.
    // Snapshot 수신 시 store clear + items 전부 set + lastSeq = 최대 seq.
    // resetClient 파라미터는 future-proof API shape 용도 (현재 사용 안 함).
    const byId: Record<string, PanelItem> = {};
    let maxSeq = 0;
    items.forEach((item) => {
      byId[item.id] = item;
      if (item.seq > maxSeq) maxSeq = item.seq;
    });
    return { byId, lastSeq: maxSeq };
  }),

  applyEvent: (event) => {
    const state = get();
    switch (event.type) {
      case 'upsert': state.upsertItem(event.item); break;
      case 'dismiss': state.dismissItem(event.itemId); break;
      case 'snapshot': state.handleSnapshot(event.items, event.resetClient); break;
    }
    // Ensure lastSeq reflects every processed event (upsert + snapshot also update internally; dismiss doesn't).
    if (event.seq > get().lastSeq) {
      set({ lastSeq: event.seq });
    }
  },

  setOpen: (open) => {
    set({ isOpen: open });
    try {
      localStorage.setItem(PANEL_OPEN_LS_KEY, String(open));
    } catch {
      // SSR / privacy mode — ignore
    }
  },

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  runningCount: () =>
    Object.values(get().byId).filter((i) => i.kind === 'run' && (i.status === 'pending' || i.status === 'running')).length,
}));

export const usePanelStore = createPanelStore();
