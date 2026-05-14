import { cn } from '@/lib/utils';
import { statisticsTabs, type StatisticsTab } from '../../lib/statistics-data';

type StatisticsTabsProps = {
  activeTab: StatisticsTab;
  onTabChange: (nextTab: StatisticsTab) => void;
};

export function StatisticsTabs({ activeTab, onTabChange }: StatisticsTabsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {statisticsTabs.map((tabItem) => {
        const Icon = tabItem.icon;

        return (
          <button
            key={tabItem.key}
            onClick={() => onTabChange(tabItem.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === tabItem.key
                ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
            )}
            type="button"
          >
            <Icon size={13} /> {tabItem.label}
          </button>
        );
      })}
    </div>
  );
}
