'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Loader2, RotateCcw, Square, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isApiError } from '@/lib/api-error';
import { resolveImageUrl } from '@/lib/resolve-url';
import { cn } from '@/lib/utils';
import { ThumbnailStatusBadge } from '../../_shared/components/thumbnails/ThumbnailStatusBadge';
import { useAdoptThumbnail } from '../../_shared/hooks/useRepresentativeImage';
import {
  thumbnailJobTitle,
  useCancelThumbnailJob,
  useDeleteThumbnailCandidate,
  useDeleteThumbnailJob,
  useReEditThumbnailJob,
  useThumbnailJobs,
  type ThumbnailJobListItem,
} from '../../_shared/hooks/useThumbnailJobs';
import {
  isThumbnailJobActive,
  isThumbnailJobAdopted,
  isThumbnailJobAwaitingAdoption,
  isThumbnailJobEnded,
} from '../../_shared/lib/thumbnail-status';
import { thumbnailGenerationEditHref } from '../../_shared/lib/product-pipeline-routes';
import { operatorReason } from '@/lib/operator-error';

export type AiEditFilter = 'generating' | 'ready' | 'adopted' | 'failed';

const FILTERS: Array<{ key: AiEditFilter; label: string; match: (job: ThumbnailJobListItem) => boolean }> = [
  { key: 'ready', label: '후보 선택', match: isThumbnailJobAwaitingAdoption },
  { key: 'generating', label: '생성중', match: isThumbnailJobActive },
  { key: 'adopted', label: '채택됨', match: isThumbnailJobAdopted },
  { key: 'failed', label: '실패 · 중단', match: isThumbnailJobEnded },
];

const byNewest = (a: ThumbnailJobListItem, b: ThumbnailJobListItem) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

function errorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) return error.message;
  return error instanceof Error ? error.message : fallback;
}

/**
 * AI 편집 job 과 그 후보(KID-313 W3a). 후보를 채택하면 작업공간의 대표이미지가 그 자산이 된다 — job 에는 선택 ·
 * 적용 단계가 없다. 몰 반영은 썸네일 생성 허브의 등록 대기에서 한다.
 */
export function AiEditTab({ filter, onChangeFilter }: { filter: AiEditFilter; onChangeFilter: (filter: AiEditFilter) => void }) {
  const { data = [], isLoading } = useThumbnailJobs({ scope: 'all', limit: 200 });
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((entry) => [entry.key, data.filter(entry.match).length])) as Record<AiEditFilter, number>,
    [data],
  );
  const active = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0];
  const jobs = useMemo(() => data.filter(active.match).sort(byNewest), [data, active]);
  const [deleteTarget, setDeleteTarget] = useState<ThumbnailJobListItem | null>(null);
  const deleteJob = useDeleteThumbnailJob();

  return (
    <div className="space-y-4">
      <div role="group" aria-label="AI 편집 상태" className="flex flex-wrap gap-1.5">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={entry.key === active.key}
            onClick={() => onChangeFilter(entry.key)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold',
              entry.key === active.key
                ? 'border-primary bg-primary text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary',
            )}
          >
            {entry.label} {counts[entry.key]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
      ) : jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          {active.label} 작업이 없습니다
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {jobs.map((job) => (
            <AiEditJobCard key={job.id} job={job} onDelete={() => setDeleteTarget(job)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        tone="danger"
        title="AI 편집 작업을 삭제할까요?"
        description={deleteTarget ? `${thumbnailJobTitle(deleteTarget)} 의 작업과 후보가 삭제됩니다. 대표이미지로 채택한 후보가 있으면 삭제할 수 없습니다.` : null}
        confirmText="삭제"
        cancelText="취소"
        onConfirm={() => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          setDeleteTarget(null);
          deleteJob.mutate(id, {
            onSuccess: () => toast.success('삭제되었습니다'),
            onError: (error) => toast.error(errorMessage(error, '삭제 실패')),
          });
        }}
      />
    </div>
  );
}

function AiEditJobCard({ job, onDelete }: { job: ThumbnailJobListItem; onDelete: () => void }) {
  const adopt = useAdoptThumbnail();
  const removeCandidate = useDeleteThumbnailCandidate();
  const reEdit = useReEditThumbnailJob();
  const cancel = useCancelThumbnailJob();
  const title = thumbnailJobTitle(job);
  const running = isThumbnailJobActive(job);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
          <div className="mt-1 flex items-center gap-1.5">
            <ThumbnailStatusBadge job={job} />
            {job.registrationStatus === 'registered' && (
              <span className="text-[10px] font-semibold text-emerald-700">몰 반영됨</span>
            )}
          </div>
          {job.errorMessage && <p className="mt-1 truncate text-xs text-rose-600">{operatorReason(job.errorMessage, 'AI 편집에 실패했습니다.')}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={thumbnailGenerationEditHref({ generationId: job.id, subjectParams: { contentWorkspaceId: job.contentWorkspaceId } })}
            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-primary hover:text-primary"
          >
            편집 화면
          </Link>
          {running ? (
            <button
              type="button"
              aria-label="AI 편집 중단"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(job.id, { onError: (error) => toast.error(errorMessage(error, '중단 실패')) })}
              className="rounded-md border border-rose-200 p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <Square size={13} />
            </button>
          ) : (
            <>
              {!job.adoptedCandidate && (
                <button
                  type="button"
                  aria-label="다시 편집"
                  disabled={reEdit.isPending}
                  onClick={() => reEdit.mutate({ id: job.id }, { onError: (error) => toast.error(errorMessage(error, '다시 편집 실패')) })}
                  className="rounded-md border border-slate-200 p-1 text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <RotateCcw size={13} />
                </button>
              )}
              <button
                type="button"
                aria-label="작업 삭제"
                onClick={onDelete}
                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:border-rose-300 hover:text-rose-600"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </header>

      {running ? (
        <div className="mt-3 flex h-24 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : job.candidates.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {job.candidates.map((candidate) => {
            const src = resolveImageUrl(candidate.url);
            return (
              <li key={candidate.id} className="group relative">
                <div
                  className={cn(
                    'aspect-square overflow-hidden rounded-lg border bg-slate-50',
                    candidate.isCurrentThumbnail ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200',
                  )}
                >
                  {src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                {candidate.isCurrentThumbnail ? (
                  <p className="mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle size={11} aria-hidden /> 대표이미지
                  </p>
                ) : (
                  <div className="mt-1 flex items-center gap-1">
                    <button
                      type="button"
                      disabled={adopt.isPending}
                      onClick={() =>
                        adopt.mutate(
                          { contentWorkspaceId: job.contentWorkspaceId, assetId: candidate.id },
                          {
                            onSuccess: () => toast.success('대표이미지로 채택했습니다'),
                            onError: (error) => toast.error(errorMessage(error, '채택 실패')),
                          },
                        )
                      }
                      className="flex-1 rounded-md bg-primary px-1.5 py-1 text-[11px] font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
                    >
                      대표이미지로 채택
                    </button>
                    <button
                      type="button"
                      aria-label="후보 삭제"
                      disabled={removeCandidate.isPending}
                      onClick={() =>
                        removeCandidate.mutate(
                          { jobId: job.id, assetId: candidate.id },
                          { onError: (error) => toast.error(errorMessage(error, '후보 삭제 실패')) },
                        )
                      }
                      className="rounded-md border border-slate-200 p-1 text-slate-500 hover:text-rose-600 disabled:opacity-50"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
