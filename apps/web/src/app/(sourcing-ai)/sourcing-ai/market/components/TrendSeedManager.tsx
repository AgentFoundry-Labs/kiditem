'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Sprout, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import {
  CHINESE_SEED_SUGGESTIONS,
  KOREAN_SEED_SUGGESTIONS,
  TREND_SOURCE_META,
  TREND_SOURCE_ORDER,
  deleteTrendSeed,
  updateTrendSeed,
  upsertTrendSeed,
  type TrendSeed,
  type TrendSource,
} from '../lib/trend-collection-api';

const pressable =
  'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';

/** 시드 키워드 등록 폼 + 시드 테이블 (소스 선택 / enabled 토글 / 삭제). */
export function TrendSeedManager({
  seeds,
  isLoading,
}: {
  seeds: TrendSeed[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [keywordCn, setKeywordCn] = useState('');
  const [sources, setSources] = useState<Set<TrendSource>>(new Set(TREND_SOURCE_ORDER));

  const invalidateSeeds = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.trendSeeds() });

  const upsertMutation = useMutation({
    mutationFn: upsertTrendSeed,
    onSuccess: (seed) => {
      toast.success(`'${seed.keyword}' 시드를 저장했습니다.`);
      setKeyword('');
      setKeywordCn('');
      setSources(new Set(TREND_SOURCE_ORDER));
      invalidateSeeds();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '시드 저장 실패'),
  });

  const toggleMutation = useMutation({
    mutationFn: (seed: TrendSeed) => updateTrendSeed(seed.id, { enabled: !seed.enabled }),
    onSuccess: invalidateSeeds,
    onError: (err) => toast.error(err instanceof Error ? err.message : '시드 상태 변경 실패'),
  });

  const sourcesMutation = useMutation({
    mutationFn: (input: { seed: TrendSeed; next: TrendSource[] }) =>
      updateTrendSeed(input.seed.id, { sources: input.next }),
    onSuccess: invalidateSeeds,
    onError: (err) => toast.error(err instanceof Error ? err.message : '수집 소스 변경 실패'),
  });

  const deleteMutation = useMutation({
    mutationFn: (seed: TrendSeed) => deleteTrendSeed(seed.id),
    onSuccess: (_, seed) => {
      toast.success(`'${seed.keyword}' 시드를 삭제했습니다.`);
      invalidateSeeds();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '시드 삭제 실패'),
  });

  const toggleFormSource = (source: TrendSource) => {
    setSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed || upsertMutation.isPending) return;
    if (sources.size === 0) {
      toast.error('수집 소스를 하나 이상 선택하세요.');
      return;
    }
    upsertMutation.mutate({
      keyword: trimmed,
      keywordCn: keywordCn.trim() || undefined,
      sources: TREND_SOURCE_ORDER.filter((source) => sources.has(source)),
    });
  };

  const toggleSeedSource = (seed: TrendSeed, source: TrendSource) => {
    if (sourcesMutation.isPending) return;
    const has = seed.sources.includes(source);
    const next = has
      ? seed.sources.filter((value) => value !== source)
      : [...seed.sources, source];
    if (next.length === 0) {
      toast.error('시드는 수집 소스를 하나 이상 유지해야 합니다.');
      return;
    }
    sourcesMutation.mutate({ seed, next });
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Sprout size={16} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">시드 키워드</h2>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              기본 문구·완구 시드와 저장한 사용자 시드로 네이버·1688·쇼츠를 조회합니다. 1688 은
              中文 검색어가 있으면 우선 사용합니다.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-b border-[var(--border)] bg-[var(--surface-sunken)] px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              한글 시드 키워드
            </span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="예: 초등 필통"
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)] focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
            <span className="mt-1.5 flex flex-wrap gap-1">
              {KOREAN_SEED_SUGGESTIONS.map((suggestion) => (
                <SuggestionChip
                  key={suggestion}
                  label={suggestion}
                  onClick={() => setKeyword(suggestion)}
                />
              ))}
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              1688 中文 키워드 <span className="font-normal text-[var(--text-tertiary)]">(선택)</span>
            </span>
            <input
              value={keywordCn}
              onChange={(event) => setKeywordCn(event.target.value)}
              placeholder="예: 文具"
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)] focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
            <span className="mt-1.5 flex flex-wrap gap-1">
              {CHINESE_SEED_SUGGESTIONS.map((suggestion) => (
                <SuggestionChip
                  key={suggestion}
                  label={suggestion}
                  onClick={() => setKeywordCn(suggestion)}
                />
              ))}
            </span>
          </label>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">수집 소스</span>
            <div className="flex flex-wrap gap-1.5">
              {TREND_SOURCE_ORDER.map((source) => {
                const active = sources.has(source);
                const meta = TREND_SOURCE_META[source];
                return (
                  <button
                    key={source}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleFormSource(source)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                      pressable,
                      active ? meta.className : 'bg-white text-[var(--text-tertiary)] ring-[var(--border)]',
                    )}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="submit"
            disabled={!keyword.trim() || upsertMutation.isPending}
            className={cn(
              'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:opacity-50',
              pressable,
            )}
          >
            {upsertMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            시드 추가
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-tertiary)]">
              <th className="px-5 py-2.5 font-semibold">키워드</th>
              <th className="px-3 py-2.5 font-semibold">中文</th>
              <th className="px-3 py-2.5 font-semibold">수집 소스</th>
              <th className="px-3 py-2.5 font-semibold">활성</th>
              <th className="px-3 py-2.5 font-semibold text-right">삭제</th>
            </tr>
          </thead>
          <tbody>
            {seeds.map((seed) => (
              <tr key={seed.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-sunken)]">
                <td className="px-5 py-3 font-semibold text-[var(--text-primary)]">{seed.keyword}</td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">
                  {seed.keywordCn ?? <span className="text-[var(--text-quaternary)]">—</span>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {TREND_SOURCE_ORDER.map((source) => {
                      const active = seed.sources.includes(source);
                      const meta = TREND_SOURCE_META[source];
                      return (
                        <button
                          key={source}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleSeedSource(seed, source)}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                            pressable,
                            active
                              ? meta.className
                              : 'bg-transparent text-[var(--text-quaternary)] ring-[var(--border)] line-through',
                          )}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={seed.enabled}
                    onClick={() => toggleMutation.mutate(seed)}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                      seed.enabled ? 'bg-purple-600' : 'bg-slate-300',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                        seed.enabled ? 'translate-x-4' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(seed)}
                    aria-label={`${seed.keyword} 시드 삭제`}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400',
                      pressable,
                    )}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!isLoading && seeds.length === 0 && (
          <div className="px-5 py-10 text-center">
            <Sprout size={28} className="mx-auto text-[var(--text-quaternary)]" />
            <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">
              아직 등록된 시드가 없습니다.
            </p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              위 제안 칩으로 문구·완구 시드를 추가하세요.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin text-purple-600" />
            시드를 불러오는 중…
          </div>
        )}
      </div>
    </section>
  );
}

function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border border-dashed border-[var(--border)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
        pressable,
      )}
    >
      + {label}
    </button>
  );
}
