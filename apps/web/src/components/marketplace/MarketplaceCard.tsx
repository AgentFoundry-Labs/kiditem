'use client';

import { Download } from 'lucide-react';

interface MarketplaceCardProps {
  item: {
    id: string;
    name: string;
    description: string;
    icon: string | null;
    installCount: number;
    category?: string;
    module?: string;
    role?: string;
  };
  type: 'workflow' | 'agent';
  onInstall: (id: string) => void;
}

const MODULE_LABELS: Record<string, string> = {
  order: '주문',
  accounting: '회계',
  inventory: '재고',
  report: '보고서',
  cs: 'CS',
};

const CATEGORY_LABELS: Record<string, string> = {
  automation: '자동화',
  monitoring: '모니터링',
  reporting: '리포팅',
  operations: '운영',
  analytics: '분석',
};

const ROLE_LABELS: Record<string, string> = {
  specialist: 'Specialist',
  manager: 'Manager',
};

export function MarketplaceCard({ item, type, onInstall }: MarketplaceCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xl shrink-0">
          {item.icon || item.name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900 text-sm truncate">{item.name}</h3>
          </div>

          {/* Description */}
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{item.description}</p>

          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {type === 'workflow' && item.module && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded">
                {MODULE_LABELS[item.module] || item.module}
              </span>
            )}
            {item.category && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded">
                {CATEGORY_LABELS[item.category] || item.category}
              </span>
            )}
            {type === 'agent' && item.role && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-600 rounded">
                {ROLE_LABELS[item.role] || item.role}
              </span>
            )}
            {item.installCount > 0 && (
              <span className="text-[10px] text-gray-400 ml-auto">
                {item.installCount}회 설치
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Install button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onInstall(item.id);
        }}
        className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
      >
        <Download size={12} />
        {type === 'workflow' ? '설치' : '활성화'}
      </button>
    </div>
  );
}
