'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HandCoins,
  Plus,
  X,
  Calendar,
  Trash2,
  DollarSign,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW } from '@/lib/utils';

interface SettlementRecord {
  id: string;
  date: string;
  type: string;
  category: string;
  counterpart: string | null;
  description: string | null;
  amount: number;
  tax: number;
  memo: string | null;
  createdBy: string | null;
}

export default function ManualSettlement() {
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data: records = [] } = useQuery({
    queryKey: ['manual-ledger', 'income', period],
    queryFn: () => apiClient.get<SettlementRecord[]>(`/api/manual-ledger?type=income&period=${period}`),
  });

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    counterpart: '',
    amount: '',
    memo: '',
  });

  const totalAmount = records.reduce((s, r) => s + r.amount, 0);

  const createMutation = useMutation({
    mutationFn: (body: { date: string; type: string; category: string; counterpart: string; amount: number; memo: string }) =>
      apiClient.post('/api/manual-ledger', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual-ledger'] });
      setShowModal(false);
      setForm({ date: new Date().toISOString().slice(0, 10), counterpart: '', amount: '', memo: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/manual-ledger/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['manual-ledger'] }),
  });

  const handleCreate = () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    createMutation.mutate({ date: form.date, type: 'income', category: 'sale', counterpart: form.counterpart, amount: Number(form.amount), memo: form.memo });
  };

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HandCoins size={18} className="text-emerald-500" />
          <div>
            <h1 className="text-base font-semibold text-gray-900 uppercase tracking-wide">Manual Settlement</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">수기 정산 관리</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-400" />
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="border rounded-lg px-3 py-1.5 text-xs" />
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">
            <Plus size={14} /> 정산 등록
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <div className="agent-card">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign size={12} className="text-emerald-500" />
              <span className="text-[10px] text-gray-500 font-mono uppercase">정산 합계</span>
            </div>
            <div className="text-xl font-bold text-emerald-600 tabular-nums">{formatKRW(totalAmount)}원</div>
          </div>
        </div>
        <div className="agent-card">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <HandCoins size={12} className="text-gray-400" />
              <span className="text-[10px] text-gray-500 font-mono uppercase">등록 건수</span>
            </div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{records.length}건</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="agent-card">
        <div className="agent-card-header">
          <h3>정산 내역 (수입)</h3>
          <span className="text-[11px] text-gray-400 font-mono">{records.length}건</span>
        </div>
        {records.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">등록된 수기 정산 내역이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>거래처</th>
                  <th>내용</th>
                  <th className="text-right">금액</th>
                  <th>메모</th>
                  <th className="text-center">삭제</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="text-gray-500 text-xs tabular-nums">{new Date(r.date).toLocaleDateString('ko-KR')}</td>
                    <td className="font-medium text-gray-900">{r.counterpart || '-'}</td>
                    <td className="text-xs text-gray-500">{r.description || '-'}</td>
                    <td className="text-right tabular-nums font-semibold text-emerald-600">{formatKRW(r.amount)}원</td>
                    <td className="text-xs text-gray-400">{r.memo || '-'}</td>
                    <td className="text-center">
                      <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={3}>합계</td>
                  <td className="text-right tabular-nums text-emerald-600">{formatKRW(totalAmount)}원</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-[420px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">수기 정산 등록</h2>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">기간 (날짜)</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">거래처</label>
                <input type="text" value={form.counterpart} onChange={(e) => setForm({ ...form, counterpart: e.target.value })} placeholder="거래처명" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">금액 *</label>
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">메모</label>
                <textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="정산 관련 메모" />
              </div>
              <button onClick={handleCreate} className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">정산 등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
