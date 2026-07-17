'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Flame, Loader2, Sparkles } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import {
  detectRisingProducts,
  fetchKeywordTrackers,
  fetchLatestRisingProducts,
  type RisingProductCandidate,
  type RisingProductGrade,
} from '../lib/rising-products-api';
import { normalizeKeyword } from '../lib/rising-keywords';
import { RisingKeywordsPanel } from './RisingKeywordsPanel';

const RISING_QUERY_KEY = ['sourcing', 'rising-products'];

const GRADE_TONE: Record<RisingProductGrade, string> = {
  A: 'bg-emerald-500/15 text-emerald-600',
  B: 'bg-sky-500/15 text-sky-600',
  C: 'bg-amber-500/15 text-amber-600',
  WATCH: 'bg-[var(--surface-sunken)] text-[var(--text-tertiary)]',
  EXCLUDE: 'bg-[var(--surface-sunken)] text-[var(--text-tertiary)]',
};

export function RisingProductsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: RISING_QUERY_KEY,
    queryFn: fetchLatestRisingProducts,
  });

  const detectMutation = useMutation({
    mutationFn: () => detectRisingProducts({ windowDays: 14 }),
    onSuccess: (result) => {
      queryClient.setQueryData(RISING_QUERY_KEY, result);
      toast.success(
        result.model.candidates.length > 0
          ? `급상승 후보 ${formatNumber(result.model.candidates.length)}개`
          : '급상승 후보를 찾지 못했습니다(수집 데이터 부족)',
      );
    },
    onError: (error) =>
      toast.error(isApiError(error) ? error.message : '급상승 감지에 실패했습니다'),
  });

  // 추적 키워드 목록 — 우측 패널과 같은 queryKey 라 캐시 공유(추가 요청 없음).
  const { data: trackers = [] } = useQuery({
    queryKey: ['sourcing', 'rising-products', 'keyword-trackers'],
    queryFn: fetchKeywordTrackers,
  });

  // apiClient는 빈 응답을 `{}`로 반환하므로 model 없는 응답은 "데이터 없음"으로 처리.
  const result = data?.model ? data : null;
  // 점수순 flat — 키워드 무관. 제외 등급은 숨겨 상위 후보만 노출.
  const candidates = useMemo(
    () => (result?.model.candidates ?? []).filter((c) => c.grade !== 'EXCLUDE'),
    [result],
  );

  // 추적했지만 아직 SERP가 안 쌓여 상품이 안 나온 키워드 수(수집 대기).
  const pendingKeywords = useMemo(() => {
    if (trackers.length === 0) return 0;
    const withProducts = new Set(candidates.map((c) => normalizeKeyword(c.keyword)));
    return trackers.filter((t) => !withProducts.has(normalizeKeyword(t.keyword))).length;
  }, [trackers, candidates]);

  return (
    <main className="min-h-full bg-[var(--surface-sunken)] text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              href="/sourcing-ai/product-tracking"
              className="mb-2 inline-flex items-center gap-1 text-xs font-black text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <ArrowLeft size={13} />
              상품 추적으로
            </Link>
            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
              <Flame size={26} className="text-[#ff5a1f]" />
              급상승 탐지
            </h1>
            <p className="mt-1 text-sm font-bold text-[var(--text-tertiary)]">
              {result
                ? `점수순 상위 ${formatNumber(candidates.length)}개`
                : '뜨는 키워드에서 리뷰·순위가 급상승 중인 상품'}
              {result && pendingKeywords > 0
                ? ` · 추적 키워드 ${formatNumber(pendingKeywords)}개는 SERP 수집 대기(1~2일 뒤 반영)`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => detectMutation.mutate()}
            disabled={detectMutation.isPending}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-sm font-black text-white transition hover:bg-[#ef4f18] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {detectMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            감지 실행
          </button>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          <section className="min-w-0">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center text-[var(--text-tertiary)]">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : candidates.length === 0 ? (
              <EmptyState hasData={Boolean(result)} />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                {candidates.map((candidate, index) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    rank={index + 1}
                    last={index === candidates.length - 1}
                  />
                ))}
              </div>
            )}
          </section>

          <RisingKeywordsPanel />
        </div>
      </div>
    </main>
  );
}

function CandidateRow({
  candidate,
  rank,
  last,
}: {
  candidate: RisingProductCandidate;
  rank: number;
  last: boolean;
}) {
  const { signals } = candidate;
  const meta: string[] = [];
  if (signals.reviewVelocityPerDay > 0) meta.push(`리뷰 +${formatNumber(signals.reviewVelocityPerDay)}/일`);
  if (signals.rankClimb != null && signals.rankClimb > 0) meta.push(`순위 ↑${formatNumber(signals.rankClimb)}`);
  if (signals.hasWingSales && signals.salesLast28d != null) meta.push(`실판매 ${formatNumber(signals.salesLast28d)}`);
  if (candidate.latestPriceKrw != null) meta.push(formatKRW(candidate.latestPriceKrw));

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--surface-sunken)]',
        !last && 'border-b border-[var(--border)]',
      )}
    >
      <span className="w-5 shrink-0 text-center text-sm font-black text-[var(--text-tertiary)]">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        {candidate.productUrl ? (
          <a
            href={candidate.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 text-sm font-black hover:text-[#ff5a1f]"
          >
            <span className="truncate">{candidate.productName}</span>
            <ExternalLink size={12} className="shrink-0 text-[var(--text-tertiary)]" />
          </a>
        ) : (
          <p className="truncate text-sm font-black">{candidate.productName}</p>
        )}
        <p className="mt-0.5 truncate text-xs font-bold text-[var(--text-tertiary)]">
          <span className="text-[var(--text-secondary)]">#{candidate.keyword}</span>
          {meta.length > 0 ? `  ·  ${meta.join('  ·  ')}` : ''}
        </p>
      </div>
      <GradeBadge grade={candidate.grade} />
      <span className="w-9 shrink-0 text-right text-xl font-black text-[#ff5a1f]">
        {candidate.score}
      </span>
    </div>
  );
}

function GradeBadge({ grade }: { grade: RisingProductGrade }) {
  return (
    <span
      className={cn(
        'hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-black sm:inline-flex',
        GRADE_TONE[grade],
      )}
    >
      {grade}
    </span>
  );
}

function EmptyState({ hasData }: { hasData: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-20 text-center">
      <Flame size={26} className="text-[var(--text-tertiary)]" />
      <p className="text-sm font-black text-[var(--text-secondary)]">
        {hasData ? '아직 급상승 후보가 없습니다' : '감지를 실행해 보세요'}
      </p>
      <p className="max-w-xs text-xs font-bold leading-relaxed text-[var(--text-tertiary)]">
        오른쪽 급상승 키워드를 추적에 추가하면 SERP가 쌓이고, 2일 이상 쌓이면 뜨는 상품이 여기 올라옵니다.
      </p>
    </div>
  );
}
