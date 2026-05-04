'use client';

import { Database, History } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EditTabType = 'basic' | 'options' | 'detail' | 'history' | 'raw';

interface ProductEditTabsProps {
  activeTab: EditTabType;
  onTabChange: (tab: EditTabType) => void;
}

const TABS: Array<{ key: EditTabType; label: string; iconKey?: 'history' | 'database' }> = [
  { key: 'basic', label: '기본정보' },
  { key: 'options', label: '옵션·판매가' },
  { key: 'detail', label: '상세페이지' },
  { key: 'history', label: '생성 이력', iconKey: 'history' },
  { key: 'raw', label: '원본 데이터', iconKey: 'database' },
];

export default function ProductEditTabs({
  activeTab,
  onTabChange,
}: ProductEditTabsProps) {
  return (
    <div className="flex border-b border-slate-200 px-2">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={cn('relative px-5 h-11 text-sm font-semibold transition-colors flex items-center gap-1.5', activeTab === tab.key ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-800')}
        >
          {tab.iconKey === 'history' && <History size={14} />}
          {tab.iconKey === 'database' && <Database size={14} />}
          {tab.label}
          {activeTab === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
          )}
        </button>
      ))}
    </div>
  );
}
