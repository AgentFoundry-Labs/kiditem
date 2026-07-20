'use client';

import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Building2,
  Check,
  Clock3,
  Compass,
  Database,
  Plus,
  Radar,
  RefreshCw,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SellochMarketAnalysisPage } from '../../components/SellochMarketAnalysisPage';
import { CompetitorSignalsSection } from './CompetitorSignalsSection';
import { GlobalSourcingOverview } from './GlobalSourcingOverview';
import { TrendCollectionSection } from './TrendCollectionSection';
import { TrendRadarSection } from './TrendRadarSection';

type MarketTab = 'overview' | 'radar' | 'collect' | 'competitors' | 'wing';

const tabs: Array<{ id: MarketTab; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: '개요', icon: Compass },
  { id: 'radar', label: '키워드', icon: Radar },
  { id: 'collect', label: '트렌드 수집', icon: RefreshCw },
  { id: 'competitors', label: '경쟁사', icon: Building2 },
  { id: 'wing', label: 'Wing 검증', icon: BarChart3 },
];

const pressable =
  'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.98] motion-reduce:transform-none';

export function MarketIntelligencePage() {
  const [activeTab, setActiveTab] = useState<MarketTab>('overview');

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`market-tab-${nextTab.id}`)?.focus();
  };

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-4 text-[var(--text-primary)]">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 lg:px-6 lg:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              시장 분석
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              중국·글로벌·한국 데이터로 문구·완구 수요를 확인합니다.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                <strong className="font-semibold text-[var(--text-primary)]">Naver 실연동</strong> · 10분 갱신
              </span>
            </span>
            <Link
              href="/rank-tracking"
              className={cn(
                'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
                pressable,
              )}
            >
              <Plus size={16} />
              추적 키워드 추가
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3.5 text-xs">
          <span className="mr-1 font-medium text-[var(--text-tertiary)]">데이터 소스</span>
          <SourceState label="한국" state="Naver 실연동" mode="live" />
          <SourceState label="글로벌" state="YouTube 수집" mode="pending" />
          <SourceState label="중국" state="1688 · Douyin 스냅샷" mode="snapshot" />
          <Link
            href="/sourcing-ai/keywords"
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]',
              pressable,
            )}
          >
            <Search size={14} />
            키워드 분석
          </Link>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="시장 분석 보기"
        className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5"
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`market-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`market-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => moveTabFocus(event, index)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                pressable,
                selected
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon size={15} className={selected ? undefined : 'text-[var(--text-tertiary)]'} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section
        id={`market-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`market-tab-${activeTab}`}
        aria-label={activeTabMeta.label}
        tabIndex={0}
        className="focus:outline-none"
      >
        {activeTab === 'overview' && (
          <GlobalSourcingOverview onOpenCollection={() => setActiveTab('collect')} />
        )}
        {activeTab === 'radar' && <TrendRadarSection />}
        {activeTab === 'collect' && <TrendCollectionSection />}
        {activeTab === 'competitors' && <CompetitorSignalsSection />}
        {activeTab === 'wing' && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-3">
              <Database size={17} className="mt-0.5 shrink-0 text-[var(--primary)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Wing 시장검증 — 실제 판매 데이터로 후보 확인
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  검색한 상품의 28일 판매·조회·가격·리뷰로 후보를 검증하세요.
                </p>
              </div>
            </div>
            <SellochMarketAnalysisPage />
          </div>
        )}
      </section>
    </main>
  );
}

function SourceState({
  label,
  state,
  mode,
}: {
  label: string;
  state: string;
  mode: 'live' | 'pending' | 'snapshot';
}) {
  const Icon = mode === 'live' ? Check : mode === 'pending' ? Clock3 : Database;
  const iconColor =
    mode === 'live' ? 'text-green-600' : mode === 'snapshot' ? 'text-purple-500' : 'text-slate-400';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 py-1">
      <Icon size={13} className={iconColor} />
      <strong className="font-semibold text-[var(--text-primary)]">{label}</strong>
      <span className="text-[var(--text-secondary)]">{state}</span>
    </span>
  );
}
