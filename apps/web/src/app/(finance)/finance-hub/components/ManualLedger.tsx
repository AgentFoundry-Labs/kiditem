'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, ArrowDownCircle, ArrowUpCircle, X, Trash2 } from 'lucide-react';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW } from '@/lib/utils';

interface Ledger {
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

interface MonthlySummary {
  month: string;
  income: number;
  expense: number;
  net: number;
}

const CATEGORIES: Record<string, string[]> = {
  income: ['sale', 'commission_refund', 'subsidy', 'interest', 'other_income'],
  expense: ['purchase', 'commission', 'shipping', 'advertising', 'labor', 'rent', 'utility', 'tax_payment', 'other_expense'],
};

const CAT_LABELS: Record<string, string> = {
  sale: '매출', commission_refund: '수수료 환급', subsidy: '지원금', interest: '이자수익', other_income: '기타수입',
  purchase: '매입', commission: '수수료', shipping: '배송비', advertising: '광고비', labor: '인건비',
  rent: '임차료', utility: '공과금', tax_payment: '세금', other_expense: '기타비용',
};

export default function ManualLedger() {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'income' | 'expense'>('income');
  const [showModal, setShowModal] = useState(false);
  const { period, setPeriod } = usePeriodSelector();

  const { data: ledgerData } = useQuery({
    queryKey: [...queryKeys.manualLedger.all, period],
    queryFn: () => apiClient.get<Ledger[]>(`/api/manual-ledger?period=${period}`),
  });

  const ledgers = ledgerData ?? [];

  const monthly = useMemo(() => {
    const monthMap = new Map<string, { income: number; expense: number }>();
    for (const l of ledgers) {
      const month = l.date.slice(0, 7);
      const entry = monthMap.get(month) || { income: 0, expense: 0 };
      if (l.type === 'income') entry.income += l.amount;
      else entry.expense += l.amount;
      monthMap.set(month, entry);
    }
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { income, expense }]) => ({
        month,
        income,
        expense,
        net: income - expense,
      }));
  }, [ledgers]);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'income' as string,
    category: 'sale',
    counterpart: '',
    description: '',
    amount: '',
    tax: '',
    memo: '',
  });

  const filtered = ledgers.filter((l) => l.type === tab);
  const totalIncome = ledgers.filter((l) => l.type === 'income').reduce((s, l) => s + l.amount, 0);
  const totalExpense = ledgers.filter((l) => l.type === 'expense').reduce((s, l) => s + l.amount, 0);

  const createMutation = useMutation({
    mutationFn: (body: { date: string; type: string; category: string; counterpart: string; description: string; amount: number; tax: number; memo: string }) =>
      apiClient.post('/api/manual-ledger', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.manualLedger.all });
      setShowModal(false);
      setForm({ date: new Date().toISOString().slice(0, 10), type: 'income', category: 'sale', counterpart: '', description: '', amount: '', tax: '', memo: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/manual-ledger/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.manualLedger.all }),
  });

  const handleCreate = () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    createMutation.mutate({ ...form, amount: Number(form.amount), tax: Number(form.tax) || 0 });
  };

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <BookOpen size={24} className="inline mr-2" />거래원장 수기관리
        </h1>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button onClick={() => { setForm({ ...form, type: tab }); setShowModal(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
            <Plus size={14} /> 등록
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 card-label"><ArrowDownCircle size={14} className="text-green-500" />수입 합계</div>
          <div className="card-value text-green-600">{formatKRW(totalIncome)}원</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 card-label"><ArrowUpCircle size={14} className="text-red-500" />지출 합계</div>
          <div className="card-value text-red-600">{formatKRW(totalExpense)}원</div>
        </div>
        <div className="card">
          <div className="card-label">차이 (수입-지출)</div>
          <div className={cn('card-value', totalIncome - totalExpense >= 0 ? 'text-green-600' : 'text-red-600')}>
            {totalIncome - totalExpense >= 0 ? '+' : ''}{formatKRW(totalIncome - totalExpense)}원
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        <button onClick={() => setTab('income')} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors', tab === 'income' ? 'bg-green-600 text-white' : 'bg-white border border-slate-200 text-green-600 hover:bg-green-50')}>
          <ArrowDownCircle size={14} className="inline mr-1" />수입 ({ledgers.filter((l) => l.type === 'income').length})
        </button>
        <button onClick={() => setTab('expense')} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors', tab === 'expense' ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-red-600 hover:bg-red-50')}>
          <ArrowUpCircle size={14} className="inline mr-1" />지출 ({ledgers.filter((l) => l.type === 'expense').length})
        </button>
      </div>

      {/* 테이블 */}
      <div className="table-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="section-title">{tab === 'income' ? '수입' : '지출'} 내역</h3>
          <span className="text-xs text-slate-400">{filtered.length}건</span>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">등록된 {tab === 'income' ? '수입' : '지출'} 내역이 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>구분</th>
                <th>거래처</th>
                <th>내용</th>
                <th className="text-right">금액</th>
                <th className="text-right">세금</th>
                <th className="text-center">삭제</th>
              </tr>
            </thead>
            <tbody >
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-900">{new Date(l.date).toLocaleDateString('ko-KR')}</td>
                  <td className="px-4 py-3"><span className={cn('px-2 py-0.5 rounded text-xs font-medium', tab === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>{CAT_LABELS[l.category] || l.category}</span></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{l.counterpart || '-'}</td>
                  <td className="px-4 py-3 text-slate-700 text-xs">{l.description || l.memo || '-'}</td>
                  <td className={cn('px-4 py-3 text-right tabular-nums font-semibold', tab === 'income' ? 'text-green-600' : 'text-red-600')}>{formatKRW(l.amount)}원</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">{l.tax > 0 ? formatKRW(l.tax) : '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleDelete(l.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 월별 합계 */}
      {monthly.length > 0 && (
        <div className="table-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="section-title">월별 합계</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>월</th>
                <th className="text-right px-4 py-3 font-medium text-green-600">수입</th>
                <th className="text-right px-4 py-3 font-medium text-red-600">지출</th>
                <th className="text-right">차이</th>
              </tr>
            </thead>
            <tbody >
              {monthly.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{m.month}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-600">{formatKRW(m.income)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatKRW(m.expense)}</td>
                  <td className={cn('px-4 py-3 text-right tabular-nums font-semibold', m.net >= 0 ? 'text-green-600' : 'text-red-600')}>{m.net >= 0 ? '+' : ''}{formatKRW(m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 등록 모달 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">거래 등록</h2>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">유형</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, category: CATEGORIES[e.target.value][0] })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="income">수입</option>
                    <option value="expense">지출</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">구분</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {(CATEGORIES[form.type] || []).map((c) => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">날짜</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">거래처</label>
                <input type="text" value={form.counterpart} onChange={(e) => setForm({ ...form, counterpart: e.target.value })} placeholder="거래처명" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">내용</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="거래 내용" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">금액</label>
                  <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">세금</label>
                  <input type="number" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">메모</label>
                <textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={handleCreate} className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
