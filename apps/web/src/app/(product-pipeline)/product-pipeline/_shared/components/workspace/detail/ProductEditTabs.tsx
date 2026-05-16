'use client';

import { Database, Images } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PRODUCT_WORKSPACE_TABS,
  type ProductWorkspaceTab,
} from '../../../lib/product-workspace-tabs';

export type EditTabType = ProductWorkspaceTab;

interface ProductEditTabsProps {
  activeTab: EditTabType;
  onTabChange: (tab: EditTabType) => void;
}

export default function ProductEditTabs({
  activeTab,
  onTabChange,
}: ProductEditTabsProps) {
  return (
    <div className="flex border-b border-slate-200 px-2">
      {PRODUCT_WORKSPACE_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={cn('relative px-5 h-11 text-sm font-semibold transition-colors flex items-center gap-1.5', activeTab === tab.key ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-800')}
        >
          {tab.iconKey === 'thumbnail' && <Images size={14} />}
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
