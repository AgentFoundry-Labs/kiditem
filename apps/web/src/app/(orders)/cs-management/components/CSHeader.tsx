'use client';

import { MessageSquare, Plus, RefreshCw } from 'lucide-react';

interface CSSummary {
  total: number;
  접수: number;
  처리중: number;
  완료: number;
}

interface Props {
  summary: CSSummary;
  onRefresh: () => void;
  onRegister: () => void;
}

export function CSHeader({ summary, onRefresh, onRegister }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <MessageSquare size={20} className="text-purple-600" />
        <div>
          <h1 className="page-title">CS 관리</h1>
          <span className="text-sm text-slate-500">
            {summary.total}건 | 접수 {summary.접수}건
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw size={14} /> 새로고침
        </button>
        <button
          onClick={onRegister}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
        >
          <Plus size={14} /> CS 등록
        </button>
      </div>
    </div>
  );
}
