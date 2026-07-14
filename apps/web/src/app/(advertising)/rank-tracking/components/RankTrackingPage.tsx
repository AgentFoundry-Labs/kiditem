'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, LineChart, RefreshCw } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import {
  detectRankExtensionGate,
  rankExtensionGateMessage,
  type RankExtensionGate,
} from '../lib/rank-extension';
import BatchRankCheck from './BatchRankCheck';
import ProductKeywordRankOverview from './ProductKeywordRankOverview';

type GateState = RankExtensionGate | { status: 'checking' };

export default function RankTrackingPage() {
  const queryClient = useQueryClient();
  const [gate, setGate] = useState<GateState>({ status: 'checking' });

  const detectGate = useCallback(() => {
    setGate({ status: 'checking' });
    detectRankExtensionGate()
      .then(setGate)
      .catch(() => setGate({ status: 'missing' }));
  }, []);

  useEffect(() => {
    detectGate();
  }, [detectGate]);

  const extensionId = gate.status === 'ready' ? gate.extensionId : null;
  const gateMessage =
    gate.status === 'checking' ? null : rankExtensionGateMessage(gate as RankExtensionGate);

  const invalidateRankData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.keywordRank() });
  }, [queryClient]);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LineChart size={20} className="text-purple-600" />
          <h1 className="page-title">쿠팡 순위추적</h1>
          <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
            Wing 판매량순 · 자사 상품 전체
          </span>
        </div>
        <div className="flex items-center gap-2">
          <BatchRankCheck
            extensionId={extensionId}
            disabledReason={gateMessage}
            onCompleted={invalidateRankData}
          />
          <button
            type="button"
            onClick={invalidateRankData}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </div>

      {/* 확장 게이트 안내 */}
      {gateMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle size={16} className="shrink-0 text-amber-500" />
            {gateMessage}
          </div>
          <button
            type="button"
            onClick={detectGate}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          >
            다시 확인
          </button>
        </div>
      )}

      {/* 자사 상품 × 대표 키워드 현재 순위와 변동 */}
      <ProductKeywordRankOverview />
    </div>
  );
}
