'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Package, Truck, CreditCard, ArrowDownCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW } from '@/lib/utils';

interface Supplier {
  id: string;
  name: string;
}

interface TimelineItem {
  id: string;
  type: 'order' | 'received' | 'payment';
  date: string;
  label: string;
  description: string;
  amount: number;
  status: string;
}

interface Summary {
  totalOrdered: number;
  totalReceived: number;
  totalPaid: number;
  unpaid: number;
  orderCount: number;
  paymentCount: number;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '대기', color: 'bg-yellow-100 text-yellow-700' },
  ordered: { label: '발주완료', color: 'bg-blue-100 text-blue-700' },
  shipped: { label: '배송중', color: 'bg-purple-100 text-purple-700' },
  inspecting: { label: '검수중', color: 'bg-orange-100 text-orange-700' },
  received: { label: '입고완료', color: 'bg-green-100 text-green-700' },
};

export default function SupplierHistory() {
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', 'list'],
    queryFn: () => apiClient.get<Supplier[]>('/api/suppliers'),
  });

  const [selectedId, setSelectedId] = useState('');

  const { data: historyData } = useQuery({
    queryKey: ['supplier-stats', 'history', selectedId],
    queryFn: () => apiClient.get<{ timeline: TimelineItem[]; summary: Summary }>(`/api/supplier-stats?type=history&supplierId=${selectedId}`),
    enabled: !!selectedId,
  });

  const timeline = historyData?.timeline ?? [];
  const summary = historyData?.summary ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History size={18} className="text-teal-500" />
          <div>
            <h1 className="text-base font-semibold text-gray-900 uppercase tracking-wide">Supplier Transaction History</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">매입처 거래현황</p>
          </div>
        </div>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]"
        >
          <option value="">매입처 선택...</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Summary KPI */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3">
              <div className="text-[10px] text-gray-500 font-mono uppercase mb-1">총 발주</div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">{summary.orderCount}건</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3">
              <div className="text-[10px] text-gray-500 font-mono uppercase mb-1">총 거래금액</div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">{formatKRW(summary.totalOrdered)}원</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3">
              <div className="text-[10px] text-gray-500 font-mono uppercase mb-1">지불 완료</div>
              <div className="text-lg font-bold text-green-600 tabular-nums">{formatKRW(summary.totalPaid)}원</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3">
              <div className="text-[10px] text-gray-500 font-mono uppercase mb-1">미결제</div>
              <div className="text-lg font-bold text-red-600 tabular-nums">{formatKRW(summary.unpaid)}원</div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {!selectedId ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-gray-400 text-sm">매입처를 선택하면 거래 이력이 표시됩니다.</div>
      ) : timeline.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-gray-400 text-sm">거래 이력이 없습니다.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">거래 타임라인</h3>
            <span className="text-[11px] text-gray-400 font-mono">{timeline.length} events</span>
          </div>
          <div className="divide-y divide-gray-100">
            {timeline.map((item, idx) => {
              const st = STATUS_MAP[item.status] || { label: item.status, color: 'bg-gray-100 text-gray-600' };
              const dotColor = item.type === 'payment' ? 'bg-blue-500' : item.type === 'received' ? 'bg-green-500' : 'bg-yellow-500';
              const Icon = item.type === 'payment' ? CreditCard : item.type === 'received' ? ArrowDownCircle : Package;
              return (
                <div key={`${item.id}-${item.type}-${idx}`} className="px-4 py-3">
                  <div className="flex items-start gap-4">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center pt-1">
                      <div className={`w-3 h-3 rounded-full ${dotColor}`} />
                      <div className="w-px h-full bg-gray-200 mt-1" />
                    </div>

                    <div className="flex-1 space-y-2">
                      {/* Event Info */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className="text-gray-500" />
                          <span className="text-sm font-medium text-gray-900">{item.label}</span>
                          <span className="text-[11px] text-gray-500 font-mono">{item.description}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${st.color}`}>{st.label}</span>
                      </div>

                      {/* Amount & Date */}
                      <div className="flex items-center gap-4 text-[11px] text-gray-500 font-mono">
                        <span className={item.type === 'payment' ? 'text-blue-600 font-medium' : 'text-gray-700 font-medium'}>
                          {formatKRW(item.amount)}원
                        </span>
                        <span className="text-gray-400">
                          <Truck size={10} className="inline mr-1" />
                          {new Date(item.date).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
