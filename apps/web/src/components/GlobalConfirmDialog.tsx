'use client';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useStore } from '@/store/useStore';

export default function GlobalConfirmDialog() {
  const dialog = useStore((s) => s.confirmDialog);
  const closeConfirm = useStore((s) => s.closeConfirm);

  if (!dialog) return null;

  return (
    <ConfirmDialog
      open={dialog.open}
      onOpenChange={(open) => {
        if (!open) closeConfirm();
      }}
      title={dialog.title ?? '확인'}
      description={dialog.message}
      confirmText={dialog.confirmText}
      cancelText={dialog.cancelText}
      onConfirm={() => {
        dialog.onConfirm();
        closeConfirm();
      }}
    />
  );
}
