'use client';

import type { ReactNode } from 'react';
import { AlertCircle, FileText, ImageIcon, Loader2, Pencil, Trash2, Wand2 } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import type { ProductLinkedContentWorkspace } from '../../lib/sourcing-api';

interface Props {
  isLoading: boolean;
  workspaces: ProductLinkedContentWorkspace[];
  deletingId: string | null;
  onOpenDetail: (workspace: ProductLinkedContentWorkspace) => void;
  onOpenThumbnail: (workspace: ProductLinkedContentWorkspace) => void;
  onDelete: (workspace: ProductLinkedContentWorkspace) => void;
}

export default function ProductContentWorkspaceList({
  isLoading,
  workspaces,
  deletingId,
  onOpenDetail,
  onOpenThumbnail,
  onDelete,
}: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
        ))}
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
          <AlertCircle size={24} className="text-slate-400" />
        </div>
        <p className="mb-2 text-lg font-bold text-slate-800">상품에 연결된 생성 콘텐츠가 없습니다.</p>
        <p className="text-sm">상세페이지 생성 또는 썸네일 AI를 상품 기준으로 실행하면 여기에 모입니다.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {workspaces.map((workspace) => {
        const isDeleting = deletingId === workspace.id;
        const canOpenDetail = Boolean(workspace.latestDetailGenerationId);
        const canOpenThumbnail = Boolean(workspace.latestThumbnailGenerationId);
        return (
          <article
            key={workspace.id}
            className={cn(
              'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
              isDeleting && 'pointer-events-none opacity-50',
            )}
          >
            <div className="relative aspect-square bg-slate-100">
              {workspace.thumbnailUrl ? (
                <img
                  src={workspace.thumbnailUrl}
                  alt={workspace.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                  No Image
                </div>
              )}
              <button
                type="button"
                onClick={() => onDelete(workspace)}
                disabled={isDeleting}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/95 text-rose-500 shadow-sm transition hover:bg-rose-50 disabled:opacity-60"
                title="생성 콘텐츠 삭제"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>

            <div className="space-y-3 p-3">
              <div>
                <h3 className="line-clamp-2 min-h-[36px] text-sm font-bold leading-[18px] text-slate-900">
                  {workspace.title}
                </h3>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{workspace.productCode ?? '상품 연결'}</span>
                  <span>·</span>
                  <span>{timeAgo(workspace.latestUpdatedAt)}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <Metric icon={<FileText size={12} />} label="상세" value={workspace.detailPageCount} />
                <Metric icon={<ImageIcon size={12} />} label="이미지" value={workspace.imageCount} />
                <Metric icon={<Wand2 size={12} />} label="썸네일" value={workspace.thumbnailGenerationCount} />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenDetail(workspace)}
                  disabled={!canOpenDetail}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Pencil size={12} /> 상세
                </button>
                <button
                  type="button"
                  onClick={() => onOpenThumbnail(workspace)}
                  disabled={!canOpenThumbnail}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ImageIcon size={12} /> 썸네일
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-center gap-1 rounded-md bg-slate-50 px-1.5 py-1 text-slate-600">
      {icon}
      <span>{label}</span>
      <span className="font-bold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
