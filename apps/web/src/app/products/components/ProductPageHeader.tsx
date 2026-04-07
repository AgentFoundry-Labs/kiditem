"use client";
import { type RefObject } from "react";
import { Plus, Download, BarChart3 } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { SyncInfo } from "@kiditem/shared";

const PERIOD_OPTIONS = [
  { days: 7, label: "7일" },
  { days: 14, label: "14일" },
  { days: 30, label: "30일" },
  { days: 365, label: "연간" },
];

interface ProductPageHeaderProps {
  total: number;
  period: number;
  onPeriodChange: (days: number) => void;
  trafficRef: RefObject<HTMLInputElement | null>;
  onTrafficUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  trafficMsg: string;
  onExcelDownload: () => void;
  onAddProduct: () => void;
  syncInfo: SyncInfo | undefined;
}

export default function ProductPageHeader({
  total, period, onPeriodChange, trafficRef, onTrafficUpload,
  trafficMsg, onExcelDownload, onAddProduct, syncInfo,
}: ProductPageHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          상품 관리 <span className="text-slate-400 font-normal">(총 <strong className="text-slate-900">{total}</strong>)</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.days}
                onClick={() => onPeriodChange(p.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === p.days ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input ref={trafficRef} type="file" accept=".xlsx,.xls,.csv" onChange={onTrafficUpload} className="hidden" />
          <button
            onClick={() => trafficRef.current?.click()}
            className="flex items-center gap-1.5 h-9 px-4 border border-cyan-400 text-cyan-700 rounded-lg text-sm hover:bg-cyan-50 bg-white"
          >
            <BarChart3 size={14} /> {period}일 트래픽 업로드
          </button>
          {trafficMsg && <span className="text-xs text-cyan-600">{trafficMsg}</span>}
          <button
            onClick={onExcelDownload}
            className="flex items-center gap-1.5 h-9 px-4 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 bg-white"
          >
            <Download size={14} /> 엑셀 다운로드
          </button>
          <button
            onClick={onAddProduct}
            className="flex items-center gap-1.5 h-9 px-4 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
          >
            <Plus size={14} /> 상품 등록
          </button>
        </div>
      </div>

      {syncInfo && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className={`w-1.5 h-1.5 rounded-full ${syncInfo.lastSyncedAt ? "bg-green-400" : "bg-amber-400"}`} />
          {syncInfo.lastSyncedAt
            ? `최근 동기화: ${timeAgo(syncInfo.lastSyncedAt)}`
            : "동기화 기록 없음 — 설정에서 동기화를 실행하세요"}
        </div>
      )}
    </>
  );
}
