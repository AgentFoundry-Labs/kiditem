'use client';
import { Search } from "lucide-react";
import type { PipelineCounts } from "@kiditem/shared";

interface ProductFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  gradeFilter: string;
  onGradeChange: (grade: string) => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  adFilter: string;
  onAdFilterChange: (filter: string) => void;
  pipelineCounts: PipelineCounts;
}

export default function ProductFilterBar({
  search, onSearchChange, onSearchSubmit, gradeFilter, onGradeChange,
  statusFilter, onStatusChange, adFilter, onAdFilterChange, pipelineCounts,
}: ProductFilterBarProps) {
  const gradeOptions = [
    { key: "all", label: "전체", color: "bg-slate-900 text-white" },
    { key: "A", label: `A등급 (${pipelineCounts.gradeA})`, color: "bg-green-100 text-green-700" },
    { key: "B", label: `B등급 (${pipelineCounts.gradeB})`, color: "bg-blue-100 text-blue-700" },
    { key: "C", label: `C등급 (${pipelineCounts.gradeC})`, color: "bg-orange-100 text-orange-700" },
  ];

  const adOptions = [
    { key: "all", label: "전체 상품" },
    { key: "ad", label: `광고중(${pipelineCounts.adCount})` },
    { key: "noad", label: `광고없음(${pipelineCounts.noAdCount})` },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <form onSubmit={onSearchSubmit} className="relative flex-1 max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="상품명/SKU 검색"
          className="h-9 pl-8 pr-3 text-sm border border-slate-300 rounded-lg w-full bg-white"
        />
      </form>
      {gradeOptions.map((f) => (
        <button
          key={f.key}
          onClick={() => onGradeChange(f.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            gradeFilter === f.key ? f.color : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {f.label}
        </button>
      ))}
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white"
      >
        <option value="all">전체 상태</option>
        <option value="active">판매중</option>
        <option value="inactive">중지</option>
        <option value="discontinued">정리</option>
      </select>
      <div className="flex items-center bg-blue-50 rounded-lg p-0.5">
        {adOptions.map((f) => (
          <button
            key={f.key}
            onClick={() => onAdFilterChange(f.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              adFilter === f.key ? "bg-white text-blue-700 shadow-sm" : "text-blue-400 hover:text-purple-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
