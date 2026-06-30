'use client';

import { useState, useRef, type ReactNode } from 'react';
import { type LucideIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  content: ReactNode;
}

export default function TabLayout({
  title,
  titleIcon: TitleIcon,
  tabs,
  defaultTab,
  activeTab: controlledTab,
  onTabChange,
  wrapTabs = false,
}: {
  title: string;
  titleIcon?: LucideIcon;
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  wrapTabs?: boolean;
}) {
  const [internalTab, setInternalTab] = useState(defaultTab || tabs[0]?.id || "");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (id: string) => {
    setInternalTab(id);
    onTabChange?.(id);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const showScrollControls = tabs.length > 5 && !wrapTabs;

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {TitleIcon && (
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <TitleIcon size={18} className="text-slate-600" />
            </div>
          )}
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h1>
        </div>
      </div>

      <div className="relative flex items-center gap-1">
        {showScrollControls && (
          <button
            type="button"
            aria-label="이전 탭"
            onClick={() => scroll("left")}
            className="shrink-0 w-6 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <div
          ref={scrollRef}
          data-testid="tab-layout-tabs"
          className={cn(
            'flex items-center gap-1 p-1 bg-slate-100/80 rounded-lg flex-1',
            wrapTabs ? 'flex-wrap overflow-hidden' : 'overflow-x-auto',
          )}
          style={wrapTabs ? undefined : { scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-150',
                  isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {Icon && <Icon size={15} className={cn(isActive && 'text-purple-600')} />}
                {tab.label}
              </button>
            );
          })}
        </div>
        {showScrollControls && (
          <button
            type="button"
            aria-label="다음 탭"
            onClick={() => scroll("right")}
            className="shrink-0 w-6 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      <div>
        {tabs.map((tab) => (
          <div key={tab.id} className={cn(activeTab === tab.id ? 'block' : 'hidden')}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
