'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  ChevronDown,
  BarChart3,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import type { Workflow } from '../page';

interface Toast {
  message: string;
  type: 'loading' | 'success' | 'error';
  actions?: { type: string; label: string; reason?: string; params?: Record<string, any> }[];
}

interface ProductHeaderProps {
  workflows: Workflow[];
  showWfMenu: boolean;
  toast: Toast | null;
  onToggleWfMenu: () => void;
  onCloseWfMenu: () => void;
  onRunWorkflow: (wf: Workflow) => void;
  onRunBatch: () => void;
  onCloseToast: () => void;
  onAction: (action: any) => void;
}

export default function ProductHeader({
  workflows,
  showWfMenu,
  toast,
  onToggleWfMenu,
  onCloseWfMenu,
  onRunWorkflow,
  onRunBatch,
  onCloseToast,
  onAction,
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
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

      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium ${
            toast.type === "loading" ? "bg-blue-600 text-white" :
            toast.type === "success" ? "bg-green-600 text-white" :
            "bg-red-600 text-white"
          } ${!toast.actions?.length ? "rounded-b-lg" : ""}`}>
            {toast.type === "loading" && <Loader2 size={14} className="animate-spin" />}
            {toast.type === "success" && <CheckCircle2 size={14} />}
            {toast.type === "error" && <XCircle size={14} />}
            {toast.message}
            <button onClick={onCloseToast} className="ml-auto opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
          {toast.actions && toast.actions.length > 0 && (
            <div className="bg-white border border-t-0 border-slate-200 rounded-b-lg shadow-lg p-2 space-y-1">
              <p className="text-xs text-slate-400 px-2 pt-1">다음 액션</p>
              {toast.actions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => { onCloseToast(); onAction(action); }}
                  className="w-full text-left px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded flex items-center gap-1.5"
                >
                  <Play size={12} className="text-blue-500" />
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
