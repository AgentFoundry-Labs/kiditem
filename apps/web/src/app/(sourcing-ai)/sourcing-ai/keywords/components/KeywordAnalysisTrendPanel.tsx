import { BarChart3, Loader2, Search, Tags, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NaverDatalabKeywordTrend } from '../../recommendations/lib/naver-keyword-api';
import type { RelatedKeywordGroups } from './keyword-analysis-helpers';

export function TrendComparePanel({
  value,
  loading,
  notice,
  items,
  onChange,
  onCompare,
}: {
  value: string;
  loading: boolean;
  notice: string | null;
  items: NaverDatalabKeywordTrend[];
  onChange: (value: string) => void;
  onCompare: () => void;
}) {
  const keywords = value.split(/\n|,/).map((keyword) => keyword.trim()).filter(Boolean).slice(0, 5);
  const inputValue = value.replace(/\n/g, ', ');

  const removeKeyword = (keywordToRemove: string) => {
    onChange(keywords.filter((keyword) => keyword !== keywordToRemove).join('\n'));
  };

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <BarChart3 size={18} className="text-[var(--primary)]" />
          <h2 className="text-base font-black">키워드별 트렌드 비교</h2>
          {notice && (
            <span className="rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-[11px] font-black text-[var(--text-secondary)]">
              {notice}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCompare}
          disabled={loading}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#7c3cff] via-[#376bff] to-[#00b7ff] px-5 text-xs font-black text-white shadow-[0_10px_20px_rgba(55,107,255,0.18)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          트렌드 비교
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-2.5">
        <div className="grid gap-2.5 xl:grid-cols-[minmax(260px,1fr)_minmax(320px,1.15fr)] xl:items-center">
          <label className="min-w-0 rounded-lg bg-[var(--surface)] px-3 py-2 shadow-sm">
            <span className="text-[11px] font-black text-[var(--text-tertiary)]">비교 키워드</span>
            <input
              value={inputValue}
              onChange={(event) => onChange(event.target.value)}
              className="mt-0.5 h-8 w-full border-0 bg-transparent text-sm font-black text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              placeholder="레고, 슬라임, 물티슈"
            />
          </label>
          <div className="min-w-0 rounded-lg bg-[var(--surface)] px-3 py-2 shadow-sm">
            <p className="text-[11px] font-black text-[var(--text-tertiary)]">선택됨 {keywords.length}/5</p>
            <div className="mt-1.5 flex min-h-8 flex-wrap items-center gap-1.5">
              {keywords.length > 0 ? keywords.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => removeKeyword(keyword)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-2.5 text-xs font-black text-[var(--text-primary)] transition hover:text-[var(--primary)]"
                  aria-label={`${keyword} 제거`}
                >
                  {keyword}
                  <X size={13} />
                </button>
              )) : (
                <span className="text-xs font-bold text-[var(--text-tertiary)]">비교할 키워드를 입력하세요.</span>
              )}
            </div>
          </div>
        </div>
      </div>
      {items.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {items.map((item) => (
            <article key={item.keyword} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-black">{item.keyword}</p>
                <span className={cn('shrink-0 text-xs font-black', item.trendDelta >= 0 ? 'text-[#0f9f6e]' : 'text-amber-700')}>
                  {item.trendDelta >= 0 ? '+' : ''}{Math.round(item.trendDelta)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <SmallStat label="최근" value={`${Math.round(item.latestRatio)}`} />
                <SmallStat label="평균" value={`${Math.round(item.previousAverageRatio)}`} />
                <SmallStat label="피크" value={`${Math.round(item.peakRatio)}`} />
              </div>
              <TrendSparkline item={item} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function RelatedKeywordPanel({
  groups,
  onUseKeyword,
}: {
  groups: RelatedKeywordGroups;
  onUseKeyword: (keyword: string) => void;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Tags size={18} className="text-[#ff5a1f]" />
        <h2 className="text-base font-black">연관 후보 묶음</h2>
      </div>
      <p className="mt-2 text-xs font-bold leading-5 text-[var(--text-secondary)]">
        셀러라이프의 상품명분석/인기키워드/자동완성 영역처럼, 현재 보드에서 바로 쓸 후보를 묶어 보여줍니다.
      </p>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <RelatedGroup title="상품명분석" caption="반복 출현 토큰" items={groups.tokens} onUseKeyword={onUseKeyword} />
        <RelatedGroup title="인기키워드" caption="보드 상위권" items={groups.hotKeywords} onUseKeyword={onUseKeyword} />
        <RelatedGroup title="자동완성 후보" caption="확장 검색어" items={groups.autocomplete} onUseKeyword={onUseKeyword} />
      </div>
    </section>
  );
}

function TrendSparkline({ item }: { item: NaverDatalabKeywordTrend }) {
  const points = item.data.slice(-12);
  if (points.length === 0) return null;

  return (
    <div className="mt-2 flex h-7 items-end gap-1">
      {points.map((point) => (
        <span
          key={`${item.keyword}:${point.period}`}
          title={`${point.period} ${Math.round(point.ratio)}`}
          className="min-w-1 flex-1 rounded-t bg-[#9fe7dd]"
          style={{ height: `${Math.max(8, Math.min(100, point.ratio))}%` }}
        />
      ))}
    </div>
  );
}

function RelatedGroup({
  title,
  caption,
  items,
  onUseKeyword,
}: {
  title: string;
  caption: string;
  items: Array<{ keyword: string; meta: string }>;
  onUseKeyword: (keyword: string) => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 bg-[var(--surface-sunken)] px-3 py-2">
        <h3 className="text-xs font-black text-[var(--text-primary)]">{title}</h3>
        <span className="text-[10px] font-bold text-[var(--text-tertiary)]">{caption}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-4 text-xs font-bold text-[var(--text-tertiary)]">키워드 보드를 갱신하면 후보가 표시됩니다.</p>
      ) : (
        <ol className="divide-y divide-[var(--border-subtle)]">
          {items.slice(0, 12).map((item, index) => (
            <li
              key={`${title}:${item.keyword}`}
              className="grid grid-cols-[28px_minmax(0,1fr)_54px] items-center gap-2 px-3 py-2.5 transition hover:bg-[var(--surface-sunken)]"
            >
              <span className="text-xs font-black text-[#ff5a1f]">{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-[var(--text-primary)]">{item.keyword}</span>
                <span className="block truncate text-[11px] font-bold text-[var(--text-tertiary)]">{item.meta}</span>
              </span>
              <button
                type="button"
                onClick={() => onUseKeyword(item.keyword)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[11px] font-black text-[var(--text-secondary)] transition hover:border-[#ffb89f] hover:text-[#d94112]"
              >
                추가
              </button>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-0.5 font-black text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
