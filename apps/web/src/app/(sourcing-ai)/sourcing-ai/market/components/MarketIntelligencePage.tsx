'use client';

import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Building2,
  Compass,
  Plus,
  Radar,
  RefreshCw,
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
    <main className="w-full space-y-4 text-[var(--text-primary)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">시장 분석</h1>
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
      </header>

      <nav
        role="tablist"
        aria-label="시장 분석 보기"
        className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-1"
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
        {activeTab === 'overview' && <GlobalSourcingOverview />}
        {activeTab === 'radar' && <TrendRadarSection />}
        {activeTab === 'collect' && <TrendCollectionSection />}
        {activeTab === 'competitors' && <CompetitorSignalsSection />}
        {activeTab === 'wing' && <SellochMarketAnalysisPage />}
      </section>
    </main>
  );
}
