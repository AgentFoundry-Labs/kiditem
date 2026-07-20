'use client';
import { Zap, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderHeaderProps {
  totalOrders: number;
  error: string | null;
  lastUpdated: string;
  syncStatus: 'idle' | 'pending' | 'success' | 'error';
  syncError: boolean;
  showCompleted: boolean;
  completedCount: number;
  loading: boolean;
  onToggleCompleted: () => void;
  onRefresh: () => void;
  headingLevel?: 1 | 2;
  showHeading?: boolean;
}

export default function OrderHeader({
  totalOrders, error, lastUpdated, syncStatus, syncError, showCompleted,
  completedCount, loading, onToggleCompleted, onRefresh,
  headingLevel = 1, showHeading = true,
}: OrderHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Zap size={18} className="text-blue-500" />
        <div>
          {showHeading ? <Heading className="page-title">주문 처리</Heading> : null}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-400">{totalOrders}건</span>
            {error && (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-mono">
                ERROR
              </span>
            )}
            {syncError && (
              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-mono">
                SYNC ERR
              </span>
            )}
            <span className="text-[10px] text-slate-400 font-mono">{lastUpdated}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {syncStatus === 'pending' && (
          <span className="text-[10px] text-purple-600 font-mono animate-pulse">쿠팡 동기화 중...</span>
        )}
        <span className="text-[10px] text-slate-400 font-mono">자동 동기화: 9/12/15/18시</span>
        <button
          onClick={onToggleCompleted}
          className={cn(
            'px-3 py-1.5 text-xs rounded-md font-mono transition-colors',
            showCompleted ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400',
          )}
        >
          {showCompleted ? "배송완료 숨기기" : `배송완료 보기 (${completedCount})`}
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-purple-600 hover:bg-purple-700 rounded-md font-mono">
          <Plus size={12} /> 수기주문
        </button>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-md font-mono"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> REFRESH
        </button>
      </div>
    </div>
  );
}
