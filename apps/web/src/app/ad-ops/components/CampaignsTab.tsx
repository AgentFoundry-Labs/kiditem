'use client';

import { useState } from 'react';
import { Megaphone, GripVertical } from 'lucide-react';
import { formatKRW, formatNumber } from '@/lib/utils';
import type { AdCampaignSnapshot, AdProductSnapshot } from '@kiditem/shared';

interface Props {
  campaigns: AdCampaignSnapshot[];
  selectedCampaign: string | null;
  onSelectCampaign: (name: string) => void;
  products: AdProductSnapshot[];
}

export function CampaignsTab({ campaigns, selectedCampaign, onSelectCampaign, products }: Props) {
  const [campaignOrder, setCampaignOrder] = useState<string[]>(() =>
    campaigns.map(c => c.campaignName),
  );
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [prodPage, setProdPage] = useState(1);
  const prodPageSize = 20;

  // Sync order when campaigns change
  if (campaigns.length > 0 && campaignOrder.length === 0) {
    setCampaignOrder(campaigns.map(c => c.campaignName));
  }

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const newOrder = [...campaignOrder];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(idx, 0, moved);
    setCampaignOrder(newOrder);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const orderedCampaigns = campaignOrder
    .map(name => campaigns.find(c => c.campaignName === name))
    .filter(Boolean) as AdCampaignSnapshot[];

  const camp = campaigns.find(c => c.campaignName === selectedCampaign);
  const totalPages = Math.ceil(products.length / prodPageSize);
  const pagedProducts = products.slice((prodPage - 1) * prodPageSize, prodPage * prodPageSize);

  const handleSelectCampaign = (name: string) => {
    onSelectCampaign(name);
    setProdPage(1);
  };

  return (
    <div className="space-y-4">
      {orderedCampaigns.length === 0 ? (
        <div className="bg-transparent rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
          <Megaphone size={28} className="text-slate-300 mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-slate-500">캠페인 데이터가 없습니다</p>
          <p className="text-[12px] text-slate-400 mt-1">익스텐션으로 동기화하면 캠페인이 표시됩니다</p>
        </div>
      ) : (
        <div className="bg-transparent rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="grid grid-cols-[32px_1fr_110px_110px_80px_80px_70px] px-4 py-2.5 bg-slate-100 border-b text-[11px] text-slate-500 font-semibold uppercase tracking-wide">
            <div /><div>캠페인명</div><div className="text-right">광고비</div><div className="text-right">전환매출</div><div className="text-right">ROAS</div><div className="text-right">클릭</div><div className="text-right">CTR</div>
          </div>
          {orderedCampaigns.map((c, idx) => (
            <div key={c.campaignName} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDragEnd={handleDragEnd} onClick={() => handleSelectCampaign(c.campaignName)}
              className={`grid grid-cols-[32px_1fr_110px_110px_80px_80px_70px] px-4 py-3 items-center cursor-pointer transition-colors border-b border-slate-100 last:border-0 ${selectedCampaign === c.campaignName ? 'bg-violet-50/80 border-l-4 border-l-violet-500' : 'hover:bg-slate-100/80'} ${dragIdx === idx ? 'opacity-50' : ''}`}>
              <GripVertical size={14} className="text-slate-300 cursor-grab" />
              <div className="flex items-center gap-2"><Megaphone size={13} className="text-violet-400 shrink-0" /><span className="text-[13px] font-semibold text-slate-900 truncate">{c.campaignName}</span></div>
              <div className="text-right text-[13px] font-medium tabular-nums text-slate-700">{formatKRW(c.adSpend)}원</div>
              <div className="text-right text-[13px] font-semibold tabular-nums text-emerald-600">{formatKRW(c.adRevenue)}원</div>
              <div className={`text-right text-[13px] font-bold tabular-nums ${(c.roas ?? 0) >= 300 ? 'text-emerald-600' : (c.roas ?? 0) >= 100 ? 'text-amber-600' : 'text-red-500'}`}>{Math.round(c.roas ?? 0)}%</div>
              <div className="text-right text-[13px] tabular-nums text-slate-600">{formatNumber(c.clicks)}</div>
              <div className="text-right text-[13px] tabular-nums text-slate-600">{c.ctr}%</div>
            </div>
          ))}
        </div>
      )}

      {selectedCampaign && camp && (
        <div className="space-y-4">
          <div className="text-[12px] text-slate-400">전체 캠페인 &gt; <span className="text-violet-600 font-semibold">{selectedCampaign}</span></div>
          <div className="bg-transparent rounded-xl border p-5">
            <div className="grid grid-cols-6 gap-3 mb-3">
              {[{ label: '광고비', value: formatKRW(camp.adSpend) + '원' }, { label: '전환매출', value: formatKRW(camp.adRevenue) + '원' }, { label: '노출', value: formatNumber(camp.impressions) }, { label: '클릭', value: formatNumber(camp.clicks) }, { label: 'ROAS', value: Math.round(camp.roas ?? 0) + '%' }, { label: '전환율', value: (camp.conversionRate ?? 0) + '%' }].map(k => (
                <div key={k.label} className="bg-slate-100 rounded-lg p-3"><div className="text-[10px] text-slate-500 mb-0.5">{k.label}</div><div className="text-lg font-bold text-slate-900 tabular-nums">{k.value}</div></div>
              ))}
            </div>
          </div>
          {products.length > 0 && (
            <div className="bg-transparent rounded-xl border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[1400px] w-full table-fixed">
                  <thead><tr className="bg-slate-100 text-[11px] text-slate-500 font-semibold uppercase">
                    <th className="text-left px-4 py-2.5 w-[80px]">상태</th><th className="text-left px-4 py-2.5 w-[340px]">상품명</th><th className="text-right px-3 py-2.5 w-[100px]">광고비</th><th className="text-right px-3 py-2.5 w-[120px]">전환매출</th><th className="text-right px-3 py-2.5 w-[80px]">클릭</th><th className="text-right px-3 py-2.5 w-[80px]">CTR</th><th className="text-right px-3 py-2.5 w-[80px]">전환수</th><th className="text-right px-3 py-2.5 w-[80px]">ROAS</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 text-[13px]">
                    {pagedProducts.map((p, i) => {
                      const cleanName = p.productName.replace(/\s*ID\s*:\s*\d+/, '').trim();
                      return (
                        <tr key={i} className="hover:bg-slate-100/80">
                          <td className="px-4 py-2.5"><span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${p.onOff === 'ON' ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'}`}>{p.onOff || 'OFF'}</span></td>
                          <td className="px-4 py-2.5 font-medium text-slate-900 truncate">{cleanName}</td>
                          <td className="text-right px-3 py-2.5 tabular-nums">{formatKRW(p.adSpend)}원</td>
                          <td className={`text-right px-3 py-2.5 tabular-nums ${p.adRevenue > 0 ? 'text-emerald-600 font-medium' : 'text-slate-300'}`}>{p.adRevenue > 0 ? formatKRW(p.adRevenue) + '원' : '0원'}</td>
                          <td className="text-right px-3 py-2.5 tabular-nums">{formatNumber(p.clicks)}</td>
                          <td className="text-right px-3 py-2.5 tabular-nums">{(p.ctr ?? 0) > 0 ? p.ctr + '%' : '-'}</td>
                          <td className="text-right px-3 py-2.5 tabular-nums">{p.adConversions}건</td>
                          {(() => {
                            const prodRoas = p.adSpend > 0 ? Math.round((p.adRevenue / p.adSpend) * 100) : 0;
                            return <td className={`text-right px-3 py-2.5 tabular-nums font-bold ${prodRoas >= 300 ? 'text-emerald-600' : prodRoas >= 100 ? 'text-amber-600' : 'text-slate-400'}`}>{prodRoas > 0 ? `${prodRoas}%` : '-'}</td>;
                          })()}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {products.length > prodPageSize && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t bg-slate-100 text-[12px]">
                  <span className="text-slate-500">{products.length}개 중 {(prodPage-1)*prodPageSize+1}~{Math.min(prodPage*prodPageSize, products.length)}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setProdPage(p => Math.max(1, p-1))} disabled={prodPage<=1} className="px-2.5 py-1 border rounded-lg disabled:opacity-30 hover:bg-slate-100">{'\u25C0'}</button>
                    <span>{prodPage}/{totalPages}</span>
                    <button onClick={() => setProdPage(p => Math.min(totalPages, p+1))} disabled={prodPage>=totalPages} className="px-2.5 py-1 border rounded-lg disabled:opacity-30 hover:bg-slate-100">{'\u25B6'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
