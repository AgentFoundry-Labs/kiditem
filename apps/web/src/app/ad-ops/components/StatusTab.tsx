'use client';

import { useState } from 'react';
import {
  AlertTriangle, Megaphone,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { formatKRW, formatNumber } from '@/lib/utils';
import type { AdTrendsData, AdRulesData, AdWeeklyPlan, AdCampaignSnapshot, AdProductSnapshot } from '@kiditem/shared';
import { AdActionPanel } from './AdActionPanel';

interface Props {
  trends: AdTrendsData | undefined;
  wingKpis: Record<string, string>;
  rules: AdRulesData['recommendations'];
  strategy: AdWeeklyPlan | undefined;
  campaigns: AdCampaignSnapshot[];
  selectedCampaign: string | null;
  onSelectCampaign: (name: string | null) => void;
  products: AdProductSnapshot[];
}

export function StatusTab({ trends, wingKpis, rules, strategy, campaigns, selectedCampaign, onSelectCampaign, products }: Props) {
  const [prodPage, setProdPage] = useState(1);
  const prodPageSize = 20;

  const camp = campaigns.find(c => c.campaignName === selectedCampaign);
  const totalPages = Math.ceil(products.length / prodPageSize);
  const pagedProducts = products.slice((prodPage - 1) * prodPageSize, prodPage * prodPageSize);

  const handleSelectCampaign = (name: string) => {
    onSelectCampaign(name);
    setProdPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Chart + AdActionPanel (3:1 grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3" style={{ height: 520 }}>
        {/* Left 3 columns: Chart */}
        <div className="lg:col-span-3 rounded-2xl flex flex-col overflow-hidden h-full bg-white shadow-md border border-slate-100">
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <h3 className="text-sm font-bold text-slate-900">광고비 · 전환매출 · ROAS 추이</h3>
            <div className="flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm opacity-60" style={{ background: '#733de5' }} />광고비</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500 opacity-60" />전환매출</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 inline-block rounded bg-violet-600" />ROAS</span>
            </div>
          </div>
          <div className="flex-1 p-4" style={{ minHeight: 280 }}>
            {trends?.daily?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trends.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="won" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v >= 10000 ? `${Math.round(v / 10000)}만` : v >= 1000 ? `${Math.round(v / 1000)}천` : String(v)} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }} formatter={(value: any, name: any) => {
                    if (name === 'roas') return [`${value}%`, 'ROAS'];
                    if (name === 'breakeven') return ['300%', '손익분기'];
                    return [`${formatKRW(Number(value))}원`, name === 'spend' ? '광고비' : '전환매출'];
                  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                  }} labelFormatter={(label: any) => `${label}일`} />
                  <Bar yAxisId="won" dataKey="spend" fill="#733de5" opacity={0.6} radius={[4, 4, 0, 0]} name="spend" barSize={24} />
                  <Bar yAxisId="won" dataKey="revenue" fill="#059669" opacity={0.6} radius={[4, 4, 0, 0]} name="revenue" barSize={24} />
                  <Line yAxisId="pct" type="monotone" dataKey="roas" stroke="#7c3aed" strokeWidth={2.5} dot={{ fill: '#7c3aed', r: 3, strokeWidth: 0 }} name="roas" />
                  <Line yAxisId="pct" type="monotone" dataKey={() => 300} stroke="#dc2626" strokeWidth={1} strokeDasharray="6 4" dot={false} name="breakeven" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <span className="text-sm text-slate-400">차트 데이터 수집 중...</span>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 column: Action panel */}
        <AdActionPanel rules={rules} strategy={strategy} />
      </div>

      {/* Wing KPIs */}
      {Object.keys(wingKpis).length > 0 && (
        <div className="rounded-2xl p-5 bg-white shadow-md border border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900">아이템위너 · 노출 현황</h2>
            <span className="text-xs text-slate-400">아이템위너 미보유 시 광고 전환율 급감</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(wingKpis).map(([label, value]) => {
              const isWarning = label.includes('노출제한') || label.includes('아이템위너 아닌') || label.includes('미보유');
              const hasIssue = isWarning && parseInt(String(value)) > 0;
              return (
                <div key={label} className={`rounded-xl p-4 text-center border ${hasIssue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                  <div className={`text-2xl font-extrabold tabular-nums ${hasIssue ? 'text-red-600' : 'text-slate-900'}`}>{value}</div>
                  <div className={`text-xs mt-1 font-medium ${hasIssue ? 'text-red-500' : 'text-slate-500'}`}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center bg-white">
          <Megaphone size={28} className="text-slate-300 mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-slate-500">캠페인 데이터가 없습니다</p>
          <p className="text-[12px] text-slate-400 mt-1">익스텐션으로 동기화하면 캠페인이 표시됩니다</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden bg-white shadow-md border border-slate-100">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Megaphone size={15} className="text-violet-600" />
              <h3 className="text-sm font-bold text-slate-900">캠페인</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">{campaigns.length}개</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] font-semibold uppercase bg-slate-50 text-slate-500">
                  <th className="text-left px-5 py-2.5">캠페인명</th>
                  <th className="text-right px-4 py-2.5">광고비</th>
                  <th className="text-right px-4 py-2.5">전환매출</th>
                  <th className="text-right px-4 py-2.5">ROAS</th>
                  <th className="text-right px-4 py-2.5">클릭</th>
                  <th className="text-right px-4 py-2.5">CTR</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.campaignName} onClick={() => handleSelectCampaign(c.campaignName)}
                    className={`cursor-pointer transition-colors border-b border-slate-100 ${selectedCampaign === c.campaignName ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                    <td className="px-5 py-3 text-sm font-semibold text-slate-900">{c.campaignName}</td>
                    <td className="text-right px-4 py-3 text-sm tabular-nums text-slate-600">{formatKRW(c.adSpend)}원</td>
                    <td className="text-right px-4 py-3 text-sm font-semibold tabular-nums text-emerald-600">{formatKRW(c.adRevenue)}원</td>
                    <td className={`text-right px-4 py-3 text-sm font-bold tabular-nums ${(c.roas ?? 0) >= 300 ? 'text-emerald-600' : (c.roas ?? 0) >= 100 ? 'text-amber-500' : 'text-red-500'}`}>{Math.round(c.roas ?? 0)}%</td>
                    <td className="text-right px-4 py-3 text-sm tabular-nums text-slate-600">{formatNumber(c.clicks)}</td>
                    <td className="text-right px-4 py-3 text-sm tabular-nums text-slate-600">{c.ctr}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaign detail */}
      {selectedCampaign && camp && (
        <div className="rounded-2xl overflow-hidden bg-white shadow-md border border-slate-100">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">캠페인</span>
              <span className="text-sm font-bold text-violet-600">{selectedCampaign}</span>
            </div>
            <button onClick={() => onSelectCampaign(null)} className="text-xs px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600">닫기</button>
          </div>
          <div className="grid grid-cols-6 gap-3 px-5 py-3 border-b border-slate-100">
            {[
              { label: '광고비', value: formatKRW(camp.adSpend) + '원' },
              { label: '전환매출', value: formatKRW(camp.adRevenue) + '원' },
              { label: '노출', value: formatNumber(camp.impressions) },
              { label: '클릭', value: formatNumber(camp.clicks) },
              { label: 'ROAS', value: Math.round(camp.roas ?? 0) + '%' },
              { label: '전환율', value: (camp.conversionRate ?? 0) + '%' },
            ].map(k => (
              <div key={k.label} className="rounded-lg p-2 bg-slate-50">
                <div className="text-[10px] text-slate-400">{k.label}</div>
                <div className="text-base font-bold tabular-nums text-slate-900">{k.value}</div>
              </div>
            ))}
          </div>
          {products.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase bg-slate-50 text-slate-500">
                    <th className="text-left px-4 py-2.5 w-[60px]">상태</th>
                    <th className="text-left px-4 py-2.5">상품명</th>
                    <th className="text-right px-3 py-2.5">광고비</th>
                    <th className="text-right px-3 py-2.5">전환매출</th>
                    <th className="text-right px-3 py-2.5">클릭</th>
                    <th className="text-right px-3 py-2.5">CTR</th>
                    <th className="text-right px-3 py-2.5">전환수</th>
                    <th className="text-right px-3 py-2.5">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((p, i) => {
                    const cleanName = p.productName.replace(/\s*ID\s*:\s*\d+/, '').trim();
                    return (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-4 py-2.5"><span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold text-white ${p.onOff === 'ON' ? 'bg-emerald-500' : 'bg-slate-400'}`}>{p.onOff || 'OFF'}</span></td>
                        <td className="px-4 py-2.5 text-sm font-medium truncate max-w-[300px] text-slate-900">{cleanName}</td>
                        <td className="text-right px-3 py-2.5 text-sm tabular-nums text-slate-600">{formatKRW(p.adSpend)}원</td>
                        <td className={`text-right px-3 py-2.5 text-sm tabular-nums font-medium ${p.adRevenue > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{p.adRevenue > 0 ? formatKRW(p.adRevenue) + '원' : '0원'}</td>
                        <td className="text-right px-3 py-2.5 text-sm tabular-nums text-slate-600">{formatNumber(p.clicks)}</td>
                        <td className="text-right px-3 py-2.5 text-sm tabular-nums text-slate-600">{(p.ctr ?? 0) > 0 ? p.ctr + '%' : '-'}</td>
                        <td className="text-right px-3 py-2.5 text-sm tabular-nums text-slate-600">{p.adConversions}건</td>
                        {(() => {
                          const prodRoas = p.adSpend > 0 ? Math.round((p.adRevenue / p.adSpend) * 100) : 0;
                          return <td className={`text-right px-3 py-2.5 text-sm font-bold tabular-nums ${prodRoas >= 300 ? 'text-emerald-600' : prodRoas >= 100 ? 'text-amber-500' : 'text-slate-400'}`}>{prodRoas > 0 ? `${prodRoas}%` : '-'}</td>;
                        })()}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {products.length > prodPageSize && (
            <div className="flex items-center justify-between px-5 py-2.5 text-xs border-t border-slate-100 bg-slate-50">
              <span className="text-slate-500">{products.length}개 중 {(prodPage - 1) * prodPageSize + 1}~{Math.min(prodPage * prodPageSize, products.length)}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setProdPage(p => Math.max(1, p - 1))} disabled={prodPage <= 1} className="px-2.5 py-1 rounded-lg border disabled:opacity-30">{'\u25C0'}</button>
                <span>{prodPage}/{totalPages}</span>
                <button onClick={() => setProdPage(p => Math.min(totalPages, p + 1))} disabled={prodPage >= totalPages} className="px-2.5 py-1 rounded-lg border disabled:opacity-30">{'\u25B6'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
