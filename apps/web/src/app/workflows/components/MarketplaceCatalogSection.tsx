'use client';
import { Filter, Store } from 'lucide-react';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import type { WorkflowCatalogItem } from '@/lib/marketplace-types';

const categoryFilters: { id: string; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'automation', label: '자동화' },
  { id: 'monitoring', label: '모니터링' },
  { id: 'reporting', label: '리포팅' },
];

interface Props {
  catalog: WorkflowCatalogItem[];
  categoryFilter: string;
  setCategoryFilter: (f: string) => void;
  onInstall: (item: WorkflowCatalogItem) => void;
  onUninstall: (marketplaceId: string) => void;
}

export function MarketplaceCatalogSection({ catalog, categoryFilter, setCategoryFilter, onInstall, onUninstall }: Props) {
  const filtered = categoryFilter === 'all' ? catalog : catalog.filter((c) => c.category === categoryFilter);

  return (
    <>
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-600" />
        <div className="flex gap-1">
          {categoryFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setCategoryFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                categoryFilter === f.id
                  ? 'bg-white text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Store size={40} className="mb-3" />
          <p className="text-sm">카탈로그가 비어 있습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <MarketplaceCard
              key={item.id}
              item={item}
              type="workflow"
              installed={item.installed}
              onInstall={() => onInstall(item)}
              onUninstall={onUninstall}
            />
          ))}
        </div>
      )}
    </>
  );
}
