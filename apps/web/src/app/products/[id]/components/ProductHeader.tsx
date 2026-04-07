'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  ChevronDown,
  BarChart3,
} from 'lucide-react';
import type { Workflow } from '../page';

interface ProductHeaderProps {
  workflows: Workflow[];
  showWfMenu: boolean;
  onToggleWfMenu: () => void;
  onCloseWfMenu: () => void;
  onRunWorkflow: (wf: Workflow) => void;
  onRunBatch: () => void;
}

export default function ProductHeader({
  workflows,
  showWfMenu,
  onToggleWfMenu,
  onCloseWfMenu,
  onRunWorkflow,
  onRunBatch,
}: ProductHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <Link
          href="/products"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} /> 상품 관리
        </Link>
        <div className="relative flex gap-2">
          <button
            onClick={onToggleWfMenu}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
          >
            <Play size={14} /> 워크플로우 실행 <ChevronDown size={14} />
          </button>
          {showWfMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={onCloseWfMenu} />
              <div className="absolute right-0 top-10 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[200px]">
              {workflows.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-400">활성 워크플로우 없음</p>
              ) : (
                <>
                  {workflows.length > 1 && (
                    <button
                      onClick={onRunBatch}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 border-b border-slate-100 font-medium text-blue-700"
                    >
                      <BarChart3 size={12} /> 전체 종합 점검
                    </button>
                  )}
                  {workflows.map((wf) => (
                    <button
                      key={wf.id}
                      onClick={() => onRunWorkflow(wf)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Play size={12} className="text-blue-500" />
                      {wf.name}
                    </button>
                  ))
                }
                </>
              )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
