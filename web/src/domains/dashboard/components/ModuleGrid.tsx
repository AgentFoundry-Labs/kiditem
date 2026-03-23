'use client';

import Link from 'next/link';
import {
  ShoppingCart, Calculator, Package, Headphones,
  FileText, Tag, Megaphone, ArrowRight, Power,
} from 'lucide-react';
import { useStore } from '@/shared/store/useStore';
import { cn, getModuleColor, formatTime, timeAgo } from '@/lib/utils';
import type { ModuleCategory } from '@/shared/types';

const moduleIcons: Record<ModuleCategory, any> = {
  order: ShoppingCart,
  accounting: Calculator,
  inventory: Package,
  cs: Headphones,
  report: FileText,
  product: Tag,
  marketing: Megaphone,
};

export default function ModuleGrid() {
  const { modules, toggleModule } = useStore();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">자동화 모듈</h2>
        <p className="text-xs text-gray-600">
          {modules.filter((m) => m.isActive).length}/{modules.length} 모듈 활성화
        </p>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {modules.map((module) => {
          const Icon = moduleIcons[module.id];
          const color = getModuleColor(module.id);

          return (
            <div
              key={module.id}
              className={cn(
                'glass-card-hover p-5 relative overflow-hidden group',
                !module.isActive && 'opacity-50'
              )}
            >
              {/* Background glow */}
              <div
                className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 transition-opacity group-hover:opacity-20"
                style={{ backgroundColor: color }}
              />

              {/* Header */}
              <div className="flex items-start justify-between mb-4 relative">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
                  >
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{module.nameKo}</h3>
                    <p className="text-[10px] text-gray-600">{module.name}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleModule(module.id);
                  }}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    module.isActive
                      ? 'text-emerald-400 hover:bg-emerald-400/10'
                      : 'text-gray-600 hover:bg-gray-600/10'
                  )}
                >
                  <Power className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              <p className="text-xs text-gray-500 mb-4 line-clamp-2 leading-relaxed">
                {module.description}
              </p>

              {/* Stats */}
              {module.isActive && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <p className="text-lg font-bold text-white">{module.activeWorkflows}</p>
                    <p className="text-[10px] text-gray-600">워크플로우</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-400">{module.todayExecutions}</p>
                    <p className="text-[10px] text-gray-600">실행</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-violet-400">{formatTime(module.savedMinutes)}</p>
                    <p className="text-[10px] text-gray-600">절감</p>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between">
                {module.lastRun ? (
                  <p className="text-[10px] text-gray-600">
                    마지막 실행: {timeAgo(module.lastRun)}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-600">미실행</p>
                )}
                <Link
                  href={`/modules/${module.id}`}
                  className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-white transition-colors"
                >
                  상세 <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
