'use client';

import { ImageIcon, Pencil } from 'lucide-react';
import { ProductInboxCardShell } from '../../_shared/components/inbox/ProductInboxCardShell';
import type { RegistrationWorkspaceSummary } from '../../_shared/lib/registration-workspaces-api';
import {
  registrationWorkspaceSubtitle,
  registrationWorkspaceThumbnail,
  registrationWorkspaceTitle,
} from '../lib/registration-workspace-view';

interface RegisteredWorkspaceCardProps {
  workspace: RegistrationWorkspaceSummary;
  isDeleting: boolean;
  selected?: boolean;
  onOpen: (workspace: RegistrationWorkspaceSummary) => void;
  onSelectedChange?: (id: string, selected: boolean) => void;
  onOpenThumbnailEditor: (workspace: RegistrationWorkspaceSummary) => void;
  onDelete: (id: string) => void;
}

export function RegisteredWorkspaceCard({
  workspace,
  isDeleting,
  selected = false,
  onOpen,
  onSelectedChange,
  onOpenThumbnailEditor,
  onDelete,
}: RegisteredWorkspaceCardProps) {
  const title = registrationWorkspaceTitle(workspace);
  const subtitle = registrationWorkspaceSubtitle(workspace);
  const thumbnailUrl = registrationWorkspaceThumbnail(workspace);

  return (
    <ProductInboxCardShell
      title={title}
      thumbnailUrl={thumbnailUrl}
      clickArea="card"
      disabled={isDeleting}
      imageFallback="Detail Image"
      onOpen={() => onOpen(workspace)}
      selectionAction={onSelectedChange
        ? {
            checked: selected,
            ariaLabel: `${title} 선택`,
            onChange: (checked) => onSelectedChange(workspace.id, checked),
          }
        : undefined}
      thumbnailTopLeft={
        <span className="w-fit max-w-full rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {subtitle}
        </span>
      }
      deleteAction={{
        isDeleting,
        onDelete: () => onDelete(workspace.id),
        title: '등록 상품 작업 삭제',
      }}
      hoverAction={{
        icon: <Pencil size={13} />,
        label: '상세',
        onClick: () => onOpen(workspace),
      }}
      footer={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenThumbnailEditor(workspace);
          }}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--text-primary)] bg-white text-[12px] font-extrabold text-[var(--text-primary)] shadow-sm transition-all hover:border-violet-600 hover:bg-violet-600 hover:text-white hover:shadow-md hover:shadow-violet-200"
        >
          <ImageIcon size={13} /> AI 썸네일 생성
        </button>
      }
    />
  );
}
