'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ConfigurableParamField } from './ConfigurableParamField';
import type { ConfigurableParam } from '../lib/marketplace-types';

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

interface AgentDetailModalProps {
  open: boolean;
  onClose: () => void;
  item: {
    id: string;
    name: string;
    description: string;
    icon: string | null;
    category: string;
    role: string | null;
    installCount: number;
    configurableParams: ConfigurableParam[];
  };
  installed: boolean;
  onInstall: (params: Record<string, any>) => void;
  onUninstall?: () => void;
  installing?: boolean;
}

export function AgentDetailModal({
  open,
  onClose,
  item,
  installed,
  onInstall,
  onUninstall,
  installing,
}: AgentDetailModalProps) {
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (open) {
      const defaults: Record<string, any> = {};
      for (const p of item.configurableParams) {
        defaults[p.key] = p.default;
      }
      setValues(defaults);
    }
  }, [open, item.configurableParams]);

  if (!open) return null;

  const setValue = (key: string, val: any) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center text-2xl shrink-0">
            {item.icon || item.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 truncate">{item.name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Description */}
        <div className="px-6 pb-4">
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{item.description}</p>
        </div>

        {/* Meta badges */}
        <div className="px-6 pb-4 flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-md">
            {CATEGORY_LABELS[item.category] || item.category}
          </span>
          <span className="px-2 py-0.5 text-xs font-medium bg-violet-50 text-violet-600 rounded-md">
            {item.role ? (ROLE_LABELS[item.role] || item.role) : 'specialist'}
          </span>
          {item.installCount > 0 && (
            <span className="text-xs text-slate-400">{item.installCount}회 고용</span>
          )}
        </div>

        {/* Config section (only when not installed) */}
        {!installed && item.configurableParams.length > 0 && (
          <>
            <div className="border-t border-slate-100 mx-6" />
            <div className="px-6 py-4 space-y-4 max-h-[300px] overflow-y-auto">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">설정</p>
              {item.configurableParams.map((param) => (
                <div key={param.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {param.label}
                  </label>
                  {param.description && (
                    <p className="text-xs text-slate-400 mb-1.5">{param.description}</p>
                  )}
                  <ConfigurableParamField
                    param={param}
                    value={values[param.key]}
                    onChange={(val) => setValue(param.key, val)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Action buttons */}
        <div className="px-6 py-5 border-t border-slate-100">
          {installed ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-green-600 bg-green-50 rounded-lg cursor-default">
                고용됨 ✓
              </div>
              {onUninstall && (
                <button
                  onClick={onUninstall}
                  className="px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                  삭제
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => onInstall(values)}
              disabled={installing}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {installing ? '고용 중...' : '고용하기'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
