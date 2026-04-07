'use client';

import { useState, useMemo } from 'react';
import { formatKRW, formatPercent, getGradeColor } from '@/lib/utils';
import type { AdsListItem, AdsSummary } from '@kiditem/shared';

interface Props {
  products: AdsListItem[];
  summary: AdsSummary;
}

export function ProductsTab({ products, summary }: Props) {
  const [adFilter, setAdFilter] = useState('all');
  const [adProductPage, setAdProductPage] = useState(1);
  const adProductPageSize = 20;

  const filteredAd = useMemo(() => products.filter(p => {
    if (adFilter === 'high') return p.adRate > 15;
    if (adFilter === 'A' || adFilter === 'B' || adFilter === 'C') return p.grade === adFilter;
    if (adFilter === '1차' || adFilter === '2차' || adFilter === '3차') return p.adTier === adFilter;
    return true;
  }), [products, adFilter]);

  const totalAdPages = Math.ceil(filteredAd.length / adProductPageSize);
  const pagedAd = filteredAd.slice((adProductPage - 1) * adProductPageSize, adProductPage * adProductPageSize);

  return (
    <div className="space-y-4">
      {/* Distribution charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-transparent rounded-xl border border-slate-200 p-4">
          <h3 className="text-[13px] font-bold text-slate-800 mb-3">ABC 등급별 광고비 배분</h3>
          <div className="space-y-2.5">
            {[{ grade: 'A', target: 80, color: 'bg-emerald-500', label: '핵심' }, { grade: 'B', target: 15, color: 'bg-amber-500', label: '성장' }, { grade: 'C', target: 5, color: 'bg-red-500', label: '정리' }].map(g => {
              const pct = summary.gradeSpendPercent[g.grade] || 0;
              const gap = pct - g.target;
              return (
                <div key={g.grade} className="flex items-center gap-2.5">
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-black text-white ${g.color}`}>{g.grade}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[11px] mb-0.5"><span className="text-slate-600">{g.label}</span><span className="tabular-nums"><span className="font-bold">{pct}%</span> <span className="text-slate-400">/ {g.target}%</span>{gap !== 0 && <span className={`ml-1 font-bold ${gap > 5 ? 'text-red-500' : gap < -5 ? 'text-amber-500' : 'text-emerald-500'}`}>{gap > 0 ? `+${gap}` : gap}%p</span>}</span></div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${g.color}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-transparent rounded-xl border border-slate-200 p-4">
          <h3 className="text-[13px] font-bold text-slate-800 mb-3">티어별 배분</h3>
          <div className="space-y-2.5">
            {[{ tier: '1차', label: '핵심', color: 'bg-violet-500' }, { tier: '2차', label: '성장', color: 'bg-blue-500' }, { tier: '3차', label: '테스트', color: 'bg-slate-400' }].map(t => {
              const spend = summary.tierSpend[t.tier] || 0;
              const pct = summary.totalSpend > 0 ? Math.round((spend / summary.totalSpend) * 100) : 0;
              return (
                <div key={t.tier} className="flex items-center gap-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${t.color}`}>{t.tier}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[11px] mb-0.5"><span className="text-slate-600">{t.label}</span><span className="tabular-nums font-bold">{pct}% <span className="font-normal text-slate-400">({formatKRW(spend)}원)</span></span></div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${t.color}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {[{ key: 'all', label: '전체' }, { key: 'high', label: `15%초과 (${products.filter(p => p.adRate > 15).length})` }, { key: 'A', label: `A (${products.filter(p => p.grade === 'A').length})` }, { key: 'B', label: `B (${products.filter(p => p.grade === 'B').length})` }, { key: 'C', label: `C (${products.filter(p => p.grade === 'C').length})` }, { key: '1차', label: '1차' }, { key: '2차', label: '2차' }, { key: '3차', label: '3차' }].map(f => (
          <button key={f.key} onClick={() => { setAdFilter(f.key); setAdProductPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${adFilter === f.key ? 'bg-violet-600 text-white' : 'bg-transparent border border-slate-200 text-slate-500 hover:bg-slate-100'}`}>{f.label}</button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-transparent rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-slate-100 text-[10px] text-slate-500 font-semibold uppercase tracking-wide">
              <th className="text-left px-3 py-2.5">등급</th><th className="text-left px-2 py-2.5">티어</th><th className="text-left px-3 py-2.5">상품명</th><th className="text-right px-2 py-2.5">광고비</th><th className="text-right px-2 py-2.5">광고매출</th><th className="text-right px-2 py-2.5">ROAS</th><th className="text-right px-2 py-2.5">CTR</th><th className="text-right px-2 py-2.5">전환율</th><th className="text-right px-2 py-2.5">광고비율</th><th className="text-right px-2 py-2.5">순이익률</th><th className="text-center px-2 py-2.5">상태</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 text-[12px]">
              {pagedAd.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-slate-500">데이터 없음</td></tr>}
              {pagedAd.map(p => (
                <tr key={p.id} className={`hover:bg-slate-100/80 ${p.adRate > 15 ? 'bg-red-50/30' : ''}`}>
                  <td className="px-3 py-2.5"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor(p.grade)}`}>{p.grade}</span></td>
                  <td className="px-2 py-2.5"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700">{p.adTier}</span></td>
                  <td className="px-3 py-2.5 font-medium text-slate-900 max-w-[220px] truncate">{p.name}</td>
                  <td className="text-right px-2 py-2.5 tabular-nums">{formatKRW(p.spend)}원</td>
                  <td className={`text-right px-2 py-2.5 tabular-nums ${p.adRevenue > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{formatKRW(p.adRevenue)}원</td>
                  <td className={`text-right px-2 py-2.5 tabular-nums font-bold ${p.roas >= 300 ? 'text-emerald-600' : p.roas >= 200 ? 'text-amber-600' : p.roas > 0 ? 'text-red-500' : 'text-slate-300'}`}>{p.roas > 0 ? `${p.roas}%` : '-'}</td>
                  <td className="text-right px-2 py-2.5 tabular-nums">{p.ctr}%</td>
                  <td className="text-right px-2 py-2.5 tabular-nums">{p.convRate}%</td>
                  <td className={`text-right px-2 py-2.5 tabular-nums font-semibold ${p.adRate > 15 ? 'text-red-600' : 'text-slate-600'}`}>{formatPercent(p.adRate)}</td>
                  <td className={`text-right px-2 py-2.5 tabular-nums ${p.profitRate < 0 ? 'text-red-600' : p.profitRate <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>{formatPercent(p.profitRate)}</td>
                  <td className="text-center px-2 py-2.5">
                    {p.adRate > 15 ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700">점검</span>
                    : p.roas > 0 && p.roas < 200 ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700">효율{'\u2193'}</span>
                    : p.roas === 0 && p.spend > 0 ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700">전환0</span>
                    : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">정상</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredAd.length > adProductPageSize && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t bg-slate-100 text-[12px]">
            <span className="text-slate-500">{filteredAd.length}개 중 {(adProductPage-1)*adProductPageSize+1}~{Math.min(adProductPage*adProductPageSize, filteredAd.length)}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setAdProductPage(p => Math.max(1, p-1))} disabled={adProductPage<=1} className="px-2.5 py-1 border rounded-lg disabled:opacity-30 hover:bg-slate-100">{'\u25C0'}</button>
              <span>{adProductPage}/{totalAdPages}</span>
              <button onClick={() => setAdProductPage(p => Math.min(totalAdPages, p+1))} disabled={adProductPage>=totalAdPages} className="px-2.5 py-1 border rounded-lg disabled:opacity-30 hover:bg-slate-100">{'\u25B6'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
