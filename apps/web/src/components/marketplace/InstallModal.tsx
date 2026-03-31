'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ConfigurableParam } from '@/lib/marketplace-types';

interface InstallModalProps {
  open: boolean;
  onClose: () => void;
  onInstall: (params: Record<string, any>) => void;
  title: string;
  description: string;
  configurableParams: ConfigurableParam[];
  type: 'workflow' | 'agent';
  installing?: boolean;
}

export function InstallModal({
  open,
  onClose,
  onInstall,
  title,
  description,
  configurableParams,
  type,
  installing,
}: InstallModalProps) {
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (open) {
      const defaults: Record<string, any> = {};
      for (const p of configurableParams) {
        defaults[p.key] = p.default;
      }
      setValues(defaults);
    }
  }, [open, configurableParams]);

  if (!open) return null;

  const setValue = (key: string, val: any) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {type === 'workflow' ? '워크플로우 설치' : '에이전트 활성화'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{title}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Description */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <p className="text-xs text-gray-600">{description}</p>
        </div>

        {/* Configurable params form */}
        {configurableParams.length > 0 && (
          <div className="px-5 py-4 space-y-4 max-h-[400px] overflow-y-auto">
            <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">설정</p>
            {configurableParams.map((param) => (
              <div key={param.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {param.label}
                </label>
                {param.description && (
                  <p className="text-xs text-gray-400 mb-1.5">{param.description}</p>
                )}
                {renderField(param, values[param.key], (val) => setValue(param.key, val))}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => onInstall(values)}
            disabled={installing}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
          >
            {installing ? '설치 중...' : type === 'workflow' ? '설치' : '활성화'}
          </button>
        </div>
      </div>
    </div>
  );
}

function renderField(
  param: ConfigurableParam,
  value: any,
  onChange: (val: any) => void,
) {
  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

  switch (param.type) {
    case 'cron':
    case 'string':
      return (
        <input
          type="text"
          className={inputClass}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(param.default)}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          className={inputClass}
          value={value ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={String(param.default)}
        />
      );
    case 'boolean':
      return (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            value ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
              value ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      );
    case 'select':
      return (
        <select
          className={inputClass}
          value={value ?? param.default}
          onChange={(e) => onChange(e.target.value)}
        >
          {param.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          type="text"
          className={inputClass}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
