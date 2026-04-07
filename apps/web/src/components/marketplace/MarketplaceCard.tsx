'use client';

import { CheckCircle } from 'lucide-react';

interface MarketplaceCardProps {
  item: {
    id: string;
    name: string;
    description: string;
    icon: string | null;
    installCount: number;
    category?: string | null;
    module?: string | null;
    role?: string | null;
  };
  type: 'workflow' | 'agent';
  installed?: boolean;
  onClick: () => void;
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

export function MarketplaceCard({ item, type, installed, onClick }: MarketplaceCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-lg p-4 hover:border-violet-300 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xl shrink-0">
          {item.icon || item.name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + installed badge */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-slate-900 text-sm truncate">{item.name}</h3>
            {installed && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-green-600 bg-green-50 rounded shrink-0">
                <CheckCircle size={10} />
                {type === 'workflow' ? '설치됨' : '고용됨'}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-slate-500 line-clamp-2 mb-3">{item.description}</p>

          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {type === 'workflow' && item.module && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded">
                {MODULE_LABELS[item.module] || item.module}
              </span>
            )}
            {item.category && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded">
                {CATEGORY_LABELS[item.category] || item.category}
              </span>
            )}
            {type === 'agent' && item.role && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-600 rounded">
                {ROLE_LABELS[item.role] || item.role}
              </span>
            )}
            {item.installCount > 0 && (
              <span className="text-[10px] text-slate-400 ml-auto">
                {item.installCount}회 {type === 'workflow' ? '설치' : '고용'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
