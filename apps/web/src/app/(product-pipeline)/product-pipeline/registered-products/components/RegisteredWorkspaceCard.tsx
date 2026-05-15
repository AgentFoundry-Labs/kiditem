'use client';

import { ImageIcon, Loader2, Pencil, Trash2 } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
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
    <article
      onClick={() => onOpen(workspace)}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
        isDeleting && 'pointer-events-none opacity-50',
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--surface-sunken)]">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--text-muted)]">
            Detail Image
          </div>
        )}

        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {onSelectedChange && (
              <input
                type="checkbox"
                checked={selected}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onSelectedChange(workspace.id, event.currentTarget.checked)}
                className="h-4 w-4 shrink-0 rounded border-white/60 bg-white/90 text-violet-600 shadow-sm"
                aria-label={`${title} 선택`}
              />
            )}
            <span className="min-w-0 truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              {subtitle}
            </span>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(workspace.id);
            }}
            disabled={isDeleting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/45 bg-white/90 text-rose-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            title="등록 상품 작업 삭제"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <h3 className="line-clamp-2 min-h-[32px] text-xs font-bold leading-4 text-[var(--text-primary)]">
            {title}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
            <span>{workspace.ownerType === 'master_product' ? '상품 연결' : '상품 후보'}</span>
            <span>·</span>
            <span>{timeAgo(workspace.updatedAt)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(workspace);
            }}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] text-[11px] font-extrabold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <Pencil size={12} /> 상세
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenThumbnailEditor(workspace);
            }}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] text-[11px] font-extrabold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <ImageIcon size={12} /> 썸네일 생성
          </button>
        </div>
      </div>
    </article>
  );
}
