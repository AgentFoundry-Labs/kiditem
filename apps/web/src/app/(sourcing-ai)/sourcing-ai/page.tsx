'use client';

import { useMemo, useState } from 'react';
import { Bot, PackageSearch, RefreshCcw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sourcingRows, type KeywordStage, type SourcingDecisionRow } from './lib/sourcing-ai-dashboard';
import { SourceCandidateModal } from './components/SourceCandidateModal';
import {
  CoupangMarketTab,
  FinalDecisionTab,
  KeywordRadarTab,
  LandedCostTab,
  OverseasSourceTab,
  OverviewTab,
  SourcingCriteriaTab,
  sourcingTabs,
  type OverviewSummary,
  type SourcingTab,
} from './components/SourcingAiTabs';

const stageFilters: Array<{ id: 'all' | KeywordStage; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'rising', label: '상승' },
  { id: 'watch', label: '관찰' },
  { id: 'blocked', label: '리스크' },
];

export default function SourcingAiPage() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SourcingTab>('overview');
  const [stageFilter, setStageFilter] = useState<'all' | KeywordStage>('all');
  const [sourceModalRow, setSourceModalRow] = useState<SourcingDecisionRow | null>(null);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sourcingRows.filter((row) => {
      const matchesStage = stageFilter === 'all' || row.stage === stageFilter;
      if (!matchesStage) return false;
      if (!normalized) return true;
      return [row.keyword, row.category, row.source.title, row.demand.signal].some((value) =>
        value.toLowerCase().includes(normalized),
      );
    });
  }, [query, stageFilter]);

  const summary = useMemo<OverviewSummary>(() => {
    const sourceNowCount = sourcingRows.filter((row) => row.action === 'source_now').length;
    return {
      sourceNowCount,
      avgScore: Math.round(
        sourcingRows.reduce((sum, row) => sum + row.score, 0) / sourcingRows.length,
      ),
      totalNewProducts: sourcingRows.reduce(
        (sum, row) => sum + row.demand.newProductDelta,
        0,
      ),
      bestLandedCost: Math.min(...sourcingRows.map((row) => row.source.landedCostKrw)),
    };
  }, []);

  return (
    <main className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface)] px-5 py-4">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
              <Bot size={19} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black text-[var(--text-primary)]">
                소싱 AI
              </h1>
              <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">
                오버뷰에서 후보를 고르고 단계별 탭에서 근거를 확인합니다.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative block lg:w-80">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                size={16}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="키워드·상품군·해외 상품명 검색"
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]"
              />
            </label>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-black text-[var(--text-primary)] transition hover:border-[var(--border-strong)]">
              <RefreshCcw size={16} />
              데이터 갱신
            </button>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-black text-[var(--primary-contrast)] transition hover:bg-[var(--primary-hover)]">
              <PackageSearch size={16} />
              키워드 추가
            </button>
          </div>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-4">
          <nav className="flex gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
            {sourcingTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-xs font-black transition',
                    activeTab === tab.id
                      ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]',
                  )}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex gap-2 overflow-x-auto">
            {stageFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStageFilter(filter.id)}
                className={cn(
                  'h-9 shrink-0 rounded-lg border px-3 text-xs font-black transition',
                  stageFilter === filter.id
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <OverviewTab rows={filteredRows} summary={summary} onOpenSourceModal={setSourceModalRow} />
          )}
          {activeTab === 'radar' && <KeywordRadarTab rows={filteredRows} />}
          {activeTab === 'coupang' && <CoupangMarketTab rows={filteredRows} />}
          {activeTab === 'criteria' && <SourcingCriteriaTab rows={filteredRows} />}
          {activeTab === 'overseas' && (
            <OverseasSourceTab rows={filteredRows} onOpenSourceModal={setSourceModalRow} />
          )}
          {activeTab === 'landedCost' && (
            <LandedCostTab rows={filteredRows} onOpenSourceModal={setSourceModalRow} />
          )}
          {activeTab === 'decision' && (
            <FinalDecisionTab rows={filteredRows} onOpenSourceModal={setSourceModalRow} />
          )}
        </div>
      </section>

      <SourceCandidateModal row={sourceModalRow} onClose={() => setSourceModalRow(null)} />
    </main>
  );
}
