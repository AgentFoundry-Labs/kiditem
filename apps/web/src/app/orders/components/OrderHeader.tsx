"use client";
import { Zap, Plus, RefreshCw } from "lucide-react";

interface OrderHeaderProps {
  totalOrders: number;
  error: string | null;
  lastUpdated: string;
  syncing: boolean;
  showCompleted: boolean;
  completedCount: number;
  loading: boolean;
  onToggleCompleted: () => void;
  onRefresh: () => void;
}

export default function OrderHeader({
  totalOrders, error, lastUpdated, syncing, showCompleted,
  completedCount, loading, onToggleCompleted, onRefresh,
}: OrderHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Zap size={18} className="text-blue-500" />
        <div>
          <h1 className="page-title">주문 처리</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-400">{totalOrders}건</span>
            {error && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-mono">ERROR</span>}
            <span className="text-[10px] text-slate-400 font-mono">{lastUpdated}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {syncing && <span className="text-[10px] text-blue-600 font-mono animate-pulse">쿠팡 동기화 중...</span>}
        <span className="text-[10px] text-slate-400 font-mono">자동 동기화: 9/12/15/18시</span>
        <button
          onClick={onToggleCompleted}
          className={`px-3 py-1.5 text-xs rounded-md font-mono transition-colors ${
            showCompleted ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-400"
          }`}
        >
          {showCompleted ? "배송완료 숨기기" : `배송완료 보기 (${completedCount})`}
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-md font-mono">
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
