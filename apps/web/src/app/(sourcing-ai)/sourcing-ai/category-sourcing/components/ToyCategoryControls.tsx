import {
  ChevronDown,
  Database,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type {
  ToyKeywordFilters,
  ToyKeywordScope,
  ToyQuickFilter,
} from '../lib/toy-keyword-intelligence';

const quickFilterMeta: Array<{
  id: ToyQuickFilter;
  label: string;
  caption: string;
}> = [
  { id: 'new-entry', label: '신규 진입', caption: '이전 비교일에 없음' },
  { id: 'rank-riser', label: '순위 상승', caption: 'DataLab 순위 상승' },
  { id: 'mobile-strong', label: '모바일 강함', caption: '실측 비중 80% 이상' },
  { id: 'trend-up', label: '검색지수 상승', caption: '이전 평균 대비 상승' },
];

const minimumSearchOptions: Array<{ value: string; label: string }> = [
  { value: 'all', label: '제한 없음' },
  { value: '100', label: '100 이상' },
  { value: '1000', label: '1,000 이상' },
  { value: '5000', label: '5,000 이상' },
  { value: '10000', label: '1만 이상' },
];

export function ToyCategoryControls({
  filters,
  resultCount,
  activeNaverSeedCount,
  isDirty,
  onFiltersChange,
  onSearch,
  onReset,
}: {
  filters: ToyKeywordFilters;
  resultCount: number;
  activeNaverSeedCount: number;
  isDirty: boolean;
  onFiltersChange: (filters: ToyKeywordFilters) => void;
  onSearch: () => void;
  onReset: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
    >
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.6fr)]">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-[var(--primary)]" />
            <h2 className="text-sm font-black text-[var(--text-primary)]">완구 카테고리</h2>
          </div>

          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
            <span className="text-[10px] font-black text-[var(--text-tertiary)]">네이버 DataLab 카테고리</span>
            <p className="mt-1 text-sm font-black text-[var(--text-primary)]">출산/육아 &gt; 완구/인형</p>
            <p className="mt-1 text-[11px] font-bold leading-5 text-[var(--text-tertiary)]">
              인기검색어 보드 <b className="text-[var(--text-secondary)]">toys_dolls</b>와 네이버 추적 시드를 합쳐 봅니다.
            </p>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] font-bold leading-5 text-sky-900">
            <Database size={14} className="mt-0.5 shrink-0" />
            <p>활성 네이버 시드 {formatNumber(activeNaverSeedCount)}개 · 시드가 있어야 월·PC·모바일 검색량이 수집됩니다.</p>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={17} className="text-[var(--primary)]" />
              <h2 className="text-sm font-black text-[var(--text-primary)]">키워드 검색 조건</h2>
            </div>
            <div className="flex items-center gap-2">
              {isDirty && (
                <span className="text-[10px] font-black text-amber-700">검색을 눌러 변경사항 적용</span>
              )}
              <span className="rounded-md bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--primary)]">
                현재 결과 {formatNumber(resultCount)}개
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[0.7fr_0.7fr_minmax(220px,1.4fr)]">
            <ControlSelect
              label="데이터 범위"
              value={filters.scope}
              onChange={(value) => onFiltersChange({ ...filters, scope: value as ToyKeywordScope })}
              options={[
                { value: 'all', label: '인기순위 + 추적 시드' },
                { value: 'popular', label: '완구 인기순위만' },
                { value: 'tracked', label: '추적 시드만' },
              ]}
            />
            <ControlSelect
              label="월 검색량 최소"
              value={filters.minSearches === null ? 'all' : String(filters.minSearches)}
              onChange={(value) => onFiltersChange({
                ...filters,
                minSearches: value === 'all' ? null : Number(value),
              })}
              options={minimumSearchOptions}
            />
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-[var(--text-tertiary)]">
                <Search size={12} /> 키워드
              </span>
              <input
                value={filters.query}
                onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
                placeholder="말랑이, 블록, 인형처럼 검색"
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-black text-[var(--text-tertiary)]">실데이터 빠른 조건</span>
            {quickFilterMeta.map((item) => {
              const active = filters.quickFilters.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFiltersChange({
                    ...filters,
                    quickFilters: active
                      ? filters.quickFilters.filter((filter) => filter !== item.id)
                      : [...filters.quickFilters, item.id],
                  })}
                  className={cn(
                    'inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-black transition',
                    active
                      ? 'border-violet-200 bg-violet-50 text-violet-700'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                  )}
                >
                  {item.label}
                  <span className="font-bold opacity-70">{item.caption}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-5 py-3">
        <p className="text-[11px] font-bold text-[var(--text-tertiary)]">
          조건 변경만으로 결과가 바뀌지 않습니다. <b className="text-[var(--text-secondary)]">검색</b>을 눌러 적용하세요.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-xs font-black text-[var(--text-secondary)] hover:bg-white"
          >
            조건 초기화
          </button>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-5 text-xs font-black text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Search size={15} /> 검색
          </button>
        </div>
      </div>
    </form>
  );
}

function ControlSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black text-[var(--text-tertiary)]">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 pr-9 text-sm font-black text-[var(--text-secondary)] outline-none focus:border-[var(--primary)]"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3.5 text-[var(--text-tertiary)]" />
      </span>
    </label>
  );
}
