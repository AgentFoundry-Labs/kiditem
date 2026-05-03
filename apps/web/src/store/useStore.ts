import { create } from 'zustand';

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
  editorDirty: false,
  setEditorDirty: (dirty: boolean) => set({ editorDirty: dirty }),
  confirmDialog: null,
  showConfirm: (opts) => set({ confirmDialog: { ...opts, open: true } }),
  closeConfirm: () => set({ confirmDialog: null }),
}));
