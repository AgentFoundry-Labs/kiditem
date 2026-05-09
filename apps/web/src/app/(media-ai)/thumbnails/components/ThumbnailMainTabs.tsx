import { Wand2 } from 'lucide-react';

export type MainTabKey = 'unclassified' | 'all' | 'needsfix' | 'ai-edit' | 'history' | 'tracking';

interface ThumbnailMainTabsProps {
  activeTab: MainTabKey;
  unclassifiedCount: number;
  analyzedCount: number;
  needsFixCount: number;
  aiEditCount: number;
  historyCount: number;
  onChangeTab: (tab: MainTabKey, opts?: { setNeedsFixFilter?: boolean; resetFilter?: boolean }) => void;
}

interface SimpleTab {
  key: 'unclassified' | 'all' | 'needsfix';
  label: string;
  count: number;
  dot?: boolean;
}

export function ThumbnailMainTabs({
  activeTab,
  unclassifiedCount,
  analyzedCount,
  needsFixCount,
  aiEditCount,
  historyCount,
  onChangeTab,
}: ThumbnailMainTabsProps) {
  const tabs: SimpleTab[] = [
    { key: 'unclassified', label: '미분류', count: unclassifiedCount, dot: unclassifiedCount > 0 },
    { key: 'all', label: '분류 완료', count: analyzedCount },
    { key: 'needsfix', label: '개선 필요', count: needsFixCount, dot: needsFixCount > 0 },
  ];

  return (
    <div
      className="flex gap-1 rounded-xl p-1.5"
      style={{
        background: 'var(--thumb-surface-sunken)',
        border: '1px solid var(--thumb-border-subtle)',
      }}
    >
      {tabs.map((tab) => (
        <PillButton
          key={tab.key}
          active={activeTab === tab.key}
          onClick={() => {
            if (tab.key === 'needsfix') {
              onChangeTab(tab.key, { setNeedsFixFilter: true });
            } else if (tab.key !== 'all') {
              onChangeTab(tab.key, { resetFilter: true });
            } else {
              onChangeTab(tab.key);
            }
          }}
        >
          {tab.label}
          {tab.count > 0 && <CountBadge active={activeTab === tab.key}>{tab.count}</CountBadge>}
          {tab.dot && activeTab !== tab.key && (
            <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </PillButton>
      ))}

      <PillButton active={activeTab === 'ai-edit'} onClick={() => onChangeTab('ai-edit')} narrowGap>
        <Wand2 size={14} />
        AI 편집
        {aiEditCount > 0 && (
          <CountBadge active={activeTab === 'ai-edit'}>{aiEditCount}</CountBadge>
        )}
      </PillButton>

      <PillButton
        active={activeTab === 'history'}
        onClick={() => onChangeTab('history', { resetFilter: true })}
      >
        이력
        {historyCount > 0 && <CountBadge active={activeTab === 'history'}>{historyCount}</CountBadge>}
      </PillButton>
    </div>
  );
}

function PillButton({
  active,
  narrowGap,
  onClick,
  children,
}: {
  active: boolean;
  narrowGap?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center ${narrowGap ? 'gap-1.5' : 'gap-2'} px-3 py-2.5 rounded-lg text-[15px] font-bold transition-colors relative`}
      style={
        active
          ? {
              background: 'var(--thumb-primary)',
              color: '#ffffff',
              boxShadow: 'var(--thumb-shadow-sm)',
            }
          : { color: 'var(--thumb-text-tertiary)' }
      }
    >
      {children}
    </button>
  );
}

function CountBadge({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className="text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-md"
      style={
        active
          ? { background: 'rgba(255,255,255,0.2)' }
          : { background: 'var(--thumb-border-subtle)' }
      }
    >
      {children}
    </span>
  );
}
