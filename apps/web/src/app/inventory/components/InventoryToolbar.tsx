'use client';

import { ClipboardCheck, Barcode, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import type { SyncInfo } from '@kiditem/shared';

interface InventoryToolbarProps {
  syncing: boolean;
  syncInfo: SyncInfo | undefined;
  onReceiveStock: () => void;
  onBarcodePrint: () => void;
  onStockCheck: () => void;
  onCoupangSync: () => void;
  onExcel: () => void;
}

export function InventoryToolbar({ syncing, syncInfo, onReceiveStock, onBarcodePrint, onStockCheck, onCoupangSync, onExcel }: InventoryToolbarProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="page-title">재고/발주 관리</h1>
        <div className="flex items-center gap-2">
          <button onClick={onReceiveStock} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
            <ClipboardCheck size={16} /> 검수 입고
          </button>
          <button onClick={onBarcodePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-medium">
            <Barcode size={16} /> 바코드 출력
          </button>
          <button onClick={onStockCheck} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium">
            <AlertTriangle size={16} /> 재고 부족 체크
          </button>
          <button onClick={onCoupangSync} disabled={syncing} className="flex items-center gap-2 px-4 py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 text-sm font-medium disabled:opacity-50">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} /> {syncing ? '동기화 중...' : '쿠팡 동기화'}
          </button>
          <button onClick={onExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            <Download size={16} /> 엑셀
          </button>
        </div>
      </div>
      {syncInfo && (
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
          <div className={`w-1.5 h-1.5 rounded-full ${syncInfo.lastSyncedAt ? 'bg-green-400' : 'bg-amber-400'}`} />
          {syncInfo.lastSyncedAt
            ? `최근 동기화: ${timeAgo(syncInfo.lastSyncedAt)}`
            : '동기화 기록 없음 — 설정에서 동기화를 실행하세요'}
        </div>
      )}
    </div>
  );
}
