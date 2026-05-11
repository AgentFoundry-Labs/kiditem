import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface DeleteCandidateConfirmDialogProps {
  open: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteCandidateConfirmDialog({
  open,
  isLoading,
  onOpenChange,
  onConfirm,
}: DeleteCandidateConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title="선택한 이미지를 삭제할까요?"
      description={
        <>
          현재 선택한 이미지 <span className="font-semibold text-[var(--text-primary,#0f172a)]">1장</span>만
          삭제되고, 같은 생성의 다른 후보는 남습니다. 마지막 1장을 삭제하면 생성 결과 자체가 함께 사라집니다.
        </>
      }
      confirmText="삭제"
      cancelText="취소"
      isLoading={isLoading}
      onConfirm={onConfirm}
    />
  );
}
