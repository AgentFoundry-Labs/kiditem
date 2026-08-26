import { create } from 'zustand';

export type ActiveRightSurface = 'notifications' | 'ai_chat' | null;

export interface ConfirmDialogState {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
}

interface AppStore {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  activeRightSurface: ActiveRightSurface;
  selectRightSurface: (surface: Exclude<ActiveRightSurface, null>) => void;
  closeRightSurface: () => void;
  resetRightSurface: () => void;
  editorDirty: boolean;
  setEditorDirty: (dirty: boolean) => void;
  confirmDialog: ConfirmDialogState | null;
  showConfirm: (opts: Omit<ConfirmDialogState, 'open'>) => void;
  closeConfirm: () => void;
}

export const useStore = create<AppStore>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
  activeRightSurface: null,
  selectRightSurface: (surface) => set((state) => ({
    activeRightSurface: state.activeRightSurface === surface ? null : surface,
  })),
  closeRightSurface: () => set({ activeRightSurface: null }),
  resetRightSurface: () => set({ activeRightSurface: null }),
  editorDirty: false,
  setEditorDirty: (dirty: boolean) => set({ editorDirty: dirty }),
  confirmDialog: null,
  showConfirm: (opts) => set({ confirmDialog: { ...opts, open: true } }),
  closeConfirm: () => set({ confirmDialog: null }),
}));
