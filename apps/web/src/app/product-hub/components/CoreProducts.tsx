'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatKRW, formatPercent, getProfitColor, getGradeColor } from '@/lib/utils';

interface Product {
  id: string; name: string; sku: string; company: string; abcGrade: string;
  imageUrl: string | null; coupangId: string | null; category: string;
  adTier: string | null; revenue?: number; netProfit?: number; profitRate?: number;
  adRate?: number; roas?: number; ctr?: number; adSpend?: number; adRevenue?: number;
  currentStock: number; reviewCount?: number; orderCount?: number; thumbnailCTR?: number;
  sellPrice?: number; costPrice?: number;
  traffic?: { visitors: number; views: number; cartAdds: number; orders: number; salesQty: number; revenue: number; conversionRate: number; date: string } | null;
  t14?: { revenue: number; salesQty: number; orders: number; conversionRate: number; date: string } | null;
  t14prev?: { revenue: number; salesQty: number; orders: number; date: string } | null;
}

export default function CoreProducts() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products.list({ limit: '200' }),
    queryFn: () =>
      apiClient.get<{ items: Product[]; total: number }>(
        '/api/products?limit=200'
      ),
  });

  const allProducts = data?.items ?? [];

  // 14일 매출 기준 동적 A등급 계산
  const withRev = allProducts
    .map((p) => ({ id: p.id, rev: p.t14?.revenue || 0 }))
    .filter((p) => p.rev > 0)
    .sort((a, b) => b.rev - a.rev);
  const totalRev14 = withRev.reduce((s, p) => s + p.rev, 0);
  const aSet = new Set<string>();
  let cum = 0;
  for (const p of withRev) {
    cum += p.rev;
    if (totalRev14 > 0 && (cum / totalRev14) * 100 <= 70) aSet.add(p.id);
    else break;
  }

  // A등급 + 점수 계산
  const coreProducts = allProducts
    .filter((p) => aSet.has(p.id))
    .map((p) => {
      // 매출 점수
      const revScore = 50;
      // 광고 효율 점수
      const pRoas = p.roas ?? 0;
      let adScore = 15;
      if (p.adTier) {
        if (pRoas >= 10) adScore = 30;
        else if (pRoas >= 5) adScore = 25;
        else if (pRoas >= 3) adScore = 20;
        else if (pRoas >= 1) adScore = 10;
        else adScore = 0;
      }
      // 전환율 점수
      const conv = p.t14?.conversionRate || 0;
      let convScore = 0;
      if (conv >= 5) convScore = 20;
      else if (conv >= 3) convScore = 15;
      else if (conv >= 1) convScore = 10;
      else if (conv > 0) convScore = 5;

      const score = revScore + adScore + convScore;

      // 광고 전략
      let strategy = '';
      if (pRoas >= 5) strategy = '광고 예산 증액 추천 -- ROAS ' + pRoas + '배, 수익 극대화 구간';
      else if (pRoas >= 3) strategy = '현재 광고 유지 -- ROAS 안정적, 키워드 확장 검토';
      else if (!p.adTier) strategy = '자연매출 우수 -- 광고 테스트 시 매출 폭발 가능';
      else if (pRoas >= 1) strategy = '키워드 최적화 필요 -- 소재 변경으로 ROAS 개선 가능';
      else strategy = '핵심 상품 -- 매출 집중 관리';

      // 순위 변동
      const rank = withRev.findIndex((w) => w.id === p.id) + 1;
      const prevWithRev = allProducts
        .map((pp) => ({ id: pp.id, rev: pp.t14prev?.revenue || 0 }))
        .filter((pp) => pp.rev > 0)
        .sort((a, b) => b.rev - a.rev);
      const prevRank = prevWithRev.findIndex((w) => w.id === p.id) + 1;
      const rankChange = prevRank > 0 ? prevRank - rank : null;

      return { ...p, score, strategy, rank, rankChange };
    })
    .sort((a, b) => b.score - a.score);

  const totalRevenue = coreProducts.reduce((s, p) => s + (p.t14?.revenue || 0), 0);
  const totalAdSpend = coreProducts.reduce((s, p) => s + (p.adSpend ?? 0), 0);

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">핵심상품 <span className="text-green-600">A등급</span></h1>
          <span className="text-sm text-slate-500">{coreProducts.length}개 상품 -- 14일 매출 누적 70% (매출 {formatKRW(totalRevenue)}원)</span>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-md font-mono">
          <RefreshCw size={12} /> REFRESH
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-900">{isLoading ? '-' : coreProducts.length}</div>
          <div className="text-xs text-slate-500 mt-1">핵심상품 수</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-blue-600 tabular-nums">{isLoading ? '-' : `${formatKRW(totalRevenue)}원`}</div>
          <div className="text-xs text-slate-500 mt-1">14일 매출 합계</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-purple-600 tabular-nums">{isLoading ? '-' : `${formatKRW(Math.round(totalAdSpend))}원`}</div>
          <div className="text-xs text-slate-500 mt-1">광고비 합계</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-green-600">{isLoading ? '-' : totalAdSpend > 0 ? `${(totalRevenue / totalAdSpend).toFixed(1)}x` : '-'}</div>
          <div className="text-xs text-slate-500 mt-1">평균 ROAS</div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
          로딩 중...
        </div>
      ) : coreProducts.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
          14일 트래픽 데이터를 업로드하면 A등급 상품이 표시됩니다.
        </div>
      ) : (
      <div className="space-y-3">
        {coreProducts.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 px-6 py-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start gap-4">
              {/* 순위 */}
              <div className="w-10 shrink-0 pt-2 text-center">
                <div className="text-xl font-bold text-slate-400 tabular-nums">#{p.rank}</div>
                {p.rankChange !== null ? (
                  p.rankChange > 0 ? <div className="text-[10px] text-green-600 font-bold">▲{p.rankChange}</div>
                  : p.rankChange < 0 ? <div className="text-[10px] text-red-500 font-bold">▼{Math.abs(p.rankChange)}</div>
                  : <div className="text-[10px] text-slate-300">-</div>
                ) : <div className="text-[10px] text-slate-300 font-mono">NEW</div>}
              </div>

              {/* 이미지 */}
              <div className="w-[88px] h-[88px] rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shrink-0">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">NO IMG</div>
                )}
              </div>

              {/* 상품 정보 */}
              <div className="flex-1 min-w-0">
                <div className="text-[16px] font-bold text-slate-900 leading-snug line-clamp-2">{p.name}</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {p.coupangId && <span>ID: {p.coupangId}</span>}
                  {p.category && <span> · {p.category}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor('A')}`}>A</span>
                  <span className="text-[10px] text-slate-400 font-mono">{p.score}점</span>
                  {p.adTier && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">{p.adTier} 광고</span>}
                  {(p.roas ?? 0) > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${(p.roas ?? 0) >= 3 ? 'bg-green-50 text-green-600' : (p.roas ?? 0) >= 1 ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'}`}>
                      ROAS {p.roas ?? 0}x
                    </span>
                  )}
                  {p.currentStock < 20 && p.currentStock > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600">재고부족 {p.currentStock}개</span>}
                </div>
                {/* 광고 전략 */}
                <div className="text-[11px] text-green-600 mt-1.5">→ {p.strategy}</div>
              </div>

              {/* 숫자 영역 */}
              <div className="flex items-start shrink-0 gap-6">
                <div className="text-center">
                  <div className="text-xl font-bold text-slate-900 tabular-nums">{p.t14?.salesQty?.toLocaleString() || '-'}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">판매량</div>
                  <div className={`text-[10px] font-medium ${getProfitColor(p.profitRate ?? 0)}`}>이익률 {formatPercent(p.profitRate ?? 0)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-slate-900 tabular-nums">{p.t14?.revenue ? formatKRW(p.t14.revenue) : '-'}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">14일 매출</div>
                  {(p.adRate ?? 0) > 0 && <div className={`text-[10px] font-medium ${(p.adRate ?? 0) > 15 ? 'text-red-600' : 'text-slate-500'}`}>광고 {formatPercent(p.adRate ?? 0)}</div>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
