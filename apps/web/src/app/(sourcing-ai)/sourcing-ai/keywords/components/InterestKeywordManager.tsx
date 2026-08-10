'use client';

import { Bookmark, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { SourcingInterestTarget } from '@kiditem/shared/sourcing';
import { cn, formatNumber } from '@/lib/utils';

interface InterestKeywordManagerProps {
  className?: string;
  loading: boolean;
  notice: string | null;
  targets: SourcingInterestTarget[];
  onRefresh: () => void;
  onRemove: (targetId: string) => void;
  onUseKeyword: (keyword: string) => void;
}

export function InterestKeywordManager({
  className,
  loading,
  notice,
  targets,
  onRefresh,
  onRemove,
  onUseKeyword,
}: InterestKeywordManagerProps) {
  const keywordTargets = targets.filter((target) => target.targetType === 'keyword' && target.keyword);

  return (
    <section className={cn('mx-auto w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-sm', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bookmark size={17} className="text-[#7c3cff]" />
            <h2 className="text-lg font-black text-[var(--text-primary)]">관심 키워드 관리</h2>
            <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[11px] font-black text-[var(--text-secondary)]">
              {formatNumber(keywordTargets.length)}개
            </span>
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-[var(--text-tertiary)]">
            키워드 분석에서 저장한 관심 키워드를 모아두고, 다시 조회하거나 추적 목록에서 제거합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-xs font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          새로고침
        </button>
      </div>

      {notice && (
        <p className="mt-3 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-xs font-black text-[var(--text-secondary)]">
          {notice}
        </p>
      )}

      {keywordTargets.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-5 text-sm font-bold text-[var(--text-tertiary)]">
          아직 관심 키워드가 없습니다. 연관키워드나 마켓별 키워드 후보에서 관심 버튼을 눌러 저장하세요.
        </div>
      ) : (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {keywordTargets.map((target) => {
            return (
              <article
                key={target.id}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-black text-[var(--text-primary)]">{target.keyword}</h3>
                  <p className="mt-1 truncate text-[11px] font-bold text-[var(--text-tertiary)]">
                    {formatInterestMeta(target)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => target.keyword && onUseKeyword(target.keyword)}
                  className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  <Search size={13} />
                  조회
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(target.id)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-tertiary)] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  aria-label={`${target.keyword} 관심 키워드 삭제`}
                >
                  <Trash2 size={14} />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatInterestMeta(target: SourcingInterestTarget) {
  const updated = target.updatedAt.slice(5, 16).replace('T', ' ');
  return `관심 등록 · ${updated}`;
}
