'use client';

import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EditTabType = 'basic' | 'options' | 'detail' | 'raw';

interface ProductEditTabsProps {
  activeTab: EditTabType;
  onTabChange: (tab: EditTabType) => void;
}

const TABS: Array<{ key: EditTabType; label: string; icon?: boolean }> = [
  { key: 'basic', label: '기본정보' },
  { key: 'options', label: '옵션·판매가' },
  { key: 'detail', label: '상세페이지' },
  { key: 'raw', label: '원본 데이터', icon: true },
];

export default function ProductEditTabs({
  activeTab,
  onTabChange,
}: ProductEditTabsProps) {
  return (
    <div className="flex border-b border-slate-200 bg-white">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={cn('relative px-6 py-3 text-sm font-medium transition-colors flex items-center gap-1.5', activeTab === tab.key ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700')}
        >
          {tab.icon && <Database size={14} />}
          {tab.label}
          {activeTab === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
