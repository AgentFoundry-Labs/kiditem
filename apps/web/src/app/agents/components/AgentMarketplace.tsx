'use client';

import { Store, Filter } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { InstallModal } from '@/components/marketplace/InstallModal';
import type { AgentCatalogItem } from '@/lib/marketplace-types';

const agentCategoryFilters: { id: string; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'operations', label: '운영' },
  { id: 'analytics', label: '분석' },
  { id: 'monitoring', label: '모니터링' },
];

export function AgentMarketplace({
  catalog,
  catalogLoading,
  categoryFilter,
  setCategoryFilter,
  filteredCatalog,
  installTarget,
  setInstallTarget,
  handleInstallAgent,
  handleUninstallAgent,
  installing,
}: {
  catalog: AgentCatalogItem[];
  catalogLoading: boolean;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  filteredCatalog: AgentCatalogItem[];
  installTarget: AgentCatalogItem | null;
  setInstallTarget: (v: AgentCatalogItem | null) => void;
  handleInstallAgent: (params: Record<string, any>) => void;
  handleUninstallAgent: (marketplaceId: string) => void;
  installing: boolean;
}) {
  return (
    <>
      {/* Category filters */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-gray-600" />
        <div className="flex gap-1">
          {agentCategoryFilters.map((f) => (
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

      {catalogLoading ? (
        <PageSkeleton variant="list" />
      ) : filteredCatalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Store size={40} className="mb-3" />
          <p className="text-sm">카탈로그가 비어 있습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCatalog.map((item) => (
            <MarketplaceCard
              key={item.id}
              item={item}
              type="agent"
              installed={item.installed}
              onInstall={() => setInstallTarget(item)}
              onUninstall={handleUninstallAgent}
            />
          ))}
        </div>
      )}

      {installTarget && (
        <InstallModal
          open={!!installTarget}
          onClose={() => setInstallTarget(null)}
          onInstall={handleInstallAgent}
          title={installTarget.name}
          description={installTarget.description}
          configurableParams={installTarget.configurableParams}
          type="agent"
          installing={installing}
        />
      )}
    </>
  );
}
