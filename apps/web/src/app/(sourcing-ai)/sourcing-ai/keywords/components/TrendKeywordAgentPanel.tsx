import { ArrowUpRight, Bot, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type {
  TrendKeywordAgentCandidate,
  TrendKeywordAgentResult,
} from '../lib/trend-keyword-agent';

export function TrendKeywordAgentPanel({
  loading,
  result,
  notice,
  compact = false,
  className,
  onRun,
  onUseKeyword,
  onCompareKeywords,
}: {
  loading: boolean;
  result: TrendKeywordAgentResult | null;
  notice: string | null;
  compact?: boolean;
  className?: string;
  onRun: () => void;
  onUseKeyword: (keyword: string) => void;
  onCompareKeywords: (keywords: string[]) => void;
}) {
  const candidates = result?.candidates ?? [];

  return (
    <section className={cn(
      'rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm',
      compact ? 'p-4' : 'p-5',
      className,
    )}>
      <div className={cn(
        'flex flex-col gap-4 xl:flex-row xl:justify-between',
        compact ? 'xl:items-center' : 'xl:items-start',
      )}>
        <div>
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-[#7c3cff]" />
            <h2 className="text-base font-black">트렌드 키워드 에이전트</h2>
          </div>
          <p className={cn(
            'mt-2 text-xs font-bold leading-5 text-[var(--text-secondary)]',
            compact && 'max-w-3xl',
          )}>
            DataLab 인기 보드, SearchAd 연관검색어, 자동완성, 최근 추세를 합쳐 소싱 검증할 키워드를 고릅니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {candidates.length > 0 && (
            <button
              type="button"
              onClick={() => onCompareKeywords(candidates.slice(0, 5).map((candidate) => candidate.keyword))}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-4 text-xs font-black text-[var(--text-secondary)] transition hover:text-[var(--primary)]"
            >
              <Plus size={15} />
              TOP 5 비교
            </button>
          )}
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-xs font-black text-white transition hover:bg-[#ef4f18] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            트렌드 찾기
          </button>
        </div>
      </div>

      {notice && (
        <p className="mt-3 rounded-md bg-[var(--surface-sunken)] px-3 py-2 text-xs font-black text-[var(--text-secondary)]">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="mt-4 flex h-32 items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-sunken)] text-sm font-black text-[var(--text-secondary)]">
          <Loader2 size={18} className="animate-spin" />
          후보 키워드를 고르는 중입니다.
        </div>
      ) : candidates.length === 0 ? (
        <div className={cn('mt-4 grid gap-2', compact ? 'lg:grid-cols-3' : 'md:grid-cols-3')}>
          <AgentEmptyStep compact={compact} title="1. 인기순위" text="DataLab 보드에서 상위 키워드를 가져옵니다." />
          <AgentEmptyStep compact={compact} title="2. 확장" text="SearchAd와 자동완성으로 주변 키워드를 넓힙니다." />
          <AgentEmptyStep compact={compact} title="3. 판정" text="최근 추세와 검색량을 합쳐 검증 순서를 정합니다." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
          <div className="grid min-w-[1180px] grid-cols-[56px_minmax(180px,1fr)_92px_140px_150px_minmax(220px,1.5fr)_130px] gap-3 bg-[var(--surface-sunken)] px-4 py-3 text-xs font-black text-[var(--text-tertiary)]">
            <span>순위</span>
            <span>키워드</span>
            <span>점수</span>
            <span>검색량</span>
            <span>추세</span>
            <span>근거</span>
            <span>작업</span>
          </div>
          <ol className="min-w-[1180px] divide-y divide-[var(--border-subtle)]">
            {candidates.slice(0, 12).map((candidate, index) => (
              <TrendKeywordAgentRow
                key={candidate.keyword}
                candidate={candidate}
                rank={index + 1}
                onUseKeyword={onUseKeyword}
              />
            ))}
          </ol>
        </div>
      )}

      {result?.notices.length ? (
        <div className="mt-3 space-y-1">
          {result.notices.slice(0, 3).map((item) => (
            <p key={item} className="text-xs font-bold text-[var(--text-tertiary)]">{item}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TrendKeywordAgentRow({
  candidate,
  rank,
  onUseKeyword,
}: {
  candidate: TrendKeywordAgentCandidate;
  rank: number;
  onUseKeyword: (keyword: string) => void;
}) {
  return (
    <li className="grid grid-cols-[56px_minmax(180px,1fr)_92px_140px_150px_minmax(220px,1.5fr)_130px] items-center gap-3 px-4 py-4 text-sm">
      <span className="text-base font-black text-[#ff5a1f]">{rank}</span>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onUseKeyword(candidate.keyword)}
          className="block truncate text-left text-base font-black text-[var(--text-primary)] transition hover:text-[var(--primary)]"
        >
          {candidate.keyword}
        </button>
        <div className="mt-1 flex flex-wrap gap-1">
          {candidate.sourceLabels.slice(0, 3).map((label) => (
            <span key={label} className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[10px] font-black text-[var(--text-secondary)]">
              {label}
            </span>
          ))}
        </div>
      </div>
      <span className={cn('font-black tabular-nums', candidate.score >= 78 ? 'text-[#0f9f6e]' : candidate.score >= 62 ? 'text-[#ff5a1f]' : 'text-[var(--text-secondary)]')}>
        {candidate.score}
      </span>
      <span className="font-bold tabular-nums text-[var(--text-secondary)]">
        {candidate.monthlyTotalSearchCount == null ? '-' : formatNumber(candidate.monthlyTotalSearchCount)}
      </span>
      <span className="font-bold text-[var(--text-secondary)]">
        {candidate.trendDelta == null ? '-' : `${candidate.trendDelta >= 0 ? '+' : ''}${formatTrendValue(candidate.trendDelta)}`}
      </span>
      <span className="min-w-0 text-xs font-bold leading-5 text-[var(--text-secondary)]">
        {candidate.reasons.length > 0 ? candidate.reasons.join(' · ') : candidate.boardLabel && candidate.boardRank ? `${candidate.boardLabel} ${candidate.boardRank}위` : candidate.grade}
      </span>
      <button
        type="button"
        onClick={() => onUseKeyword(candidate.keyword)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
      >
        <Search size={14} />
        분석
        <ArrowUpRight size={13} />
      </button>
    </li>
  );
}

function AgentEmptyStep({ compact, title, text }: { compact?: boolean; title: string; text: string }) {
  return (
    <article className={cn(
      'rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)]',
      compact ? 'px-4 py-3' : 'p-4',
    )}>
      <h3 className="text-sm font-black text-[var(--text-primary)]">{title}</h3>
      <p className="mt-2 text-xs font-bold leading-5 text-[var(--text-secondary)]">{text}</p>
    </article>
  );
}

function formatTrendValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
