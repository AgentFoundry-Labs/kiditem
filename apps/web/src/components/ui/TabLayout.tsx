'use client';

import { useId, useState, useRef, type KeyboardEvent, type ReactNode } from 'react';
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
  unmountInactive = false,
  headingLevel = 1,
  showTitle = true,
  headerActions,
}: {
  title: string;
  titleIcon?: LucideIcon;
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  wrapTabs?: boolean;
  unmountInactive?: boolean;
  headingLevel?: 1 | 2;
  showTitle?: boolean;
  headerActions?: ReactNode;
}) {
  const [internalTab, setInternalTab] = useState(defaultTab || tabs[0]?.id || "");
  const requestedTab = controlledTab ?? internalTab;
  const activeTab = tabs.some((tab) => tab.id === requestedTab)
    ? requestedTab
    : tabs[0]?.id ?? '';
  const setActiveTab = (id: string) => {
    setInternalTab(id);
    onTabChange?.(id);
  };
  const layoutId = useId().replace(/:/g, '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const showScrollControls = tabs.length > 5 && !wrapTabs;

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  };

  const selectTabAt = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    setActiveTab(tab.id);
    tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTabAt(nextIndex);
  };

  const tabDomId = (tabId: string) => `${layoutId}-tab-${tabId}`;
  const panelDomId = (tabId: string) => `${layoutId}-panel-${tabId}`;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <div className="space-y-4">
      {showTitle ? <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {TitleIcon && (
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <TitleIcon size={18} className="text-slate-600" />
            </div>
          )}
          <Heading className="text-xl font-bold text-slate-900 tracking-tight">{title}</Heading>
        </div>
        {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
      </div> : null}

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
          role="tablist"
          aria-label={title}
          className={cn(
            'flex items-center gap-1 p-1 bg-slate-100/80 rounded-lg flex-1',
            wrapTabs ? 'flex-wrap overflow-hidden' : 'overflow-x-auto',
          )}
          style={wrapTabs ? undefined : { scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(element) => { tabRefs.current[index] = element; }}
                type="button"
                id={tabDomId(tab.id)}
                role="tab"
                aria-selected={isActive}
                aria-controls={panelDomId(tab.id)}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
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
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          if (unmountInactive && !isActive) return null;
          return (
            <div
              key={tab.id}
              id={panelDomId(tab.id)}
              role="tabpanel"
              aria-labelledby={tabDomId(tab.id)}
              tabIndex={0}
              hidden={!isActive}
              className={cn(isActive ? 'block' : 'hidden')}
            >
              {tab.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
