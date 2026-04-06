'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
  DollarSign,
  Wallet,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW } from '@/lib/utils';

interface Payment {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: string | null;
  paidDate: string | null;
  purchaseOrderId: string | null;
  notes: string | null;
  createdAt: string;
}

interface Summary {
  totalAmount: number;
  totalPaid: number;
  totalUnpaid: number;
}

interface Counts {
  all: number;
  unpaid: number;
  partial: number;
  paid: number;
}

const TAB_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  unpaid: { label: '미지급', color: 'text-red-600', icon: AlertTriangle },
  partial: { label: '부분지급', color: 'text-yellow-600', icon: Clock },
  paid: { label: '지급완료', color: 'text-green-600', icon: CheckCircle },
};

export default function SupplierPayments() {
  const queryClient = useQueryClient();

  const { data: paymentsData } = useQuery({
    queryKey: ['supplier-payments'],
    queryFn: () => apiClient.get<Payment[]>('/api/supplier-payments'),
  });

  const payments = paymentsData ?? [];
  const summary = {
    totalAmount: payments.reduce((s, p) => s + (p.amount ?? 0), 0),
    totalPaid: payments.reduce((s, p) => s + (p.paidAmount ?? 0), 0),
    totalUnpaid: payments.reduce((s, p) => s + ((p.amount ?? 0) - (p.paidAmount ?? 0)), 0),
  };
  const counts = {
    all: payments.length,
    unpaid: payments.filter(p => p.status === 'unpaid').length,
    partial: payments.filter(p => p.status === 'partial').length,
    paid: payments.filter(p => p.status === 'paid').length,
  };

  const [tab, setTab] = useState('unpaid');
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const payMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      apiClient.patch(`/api/supplier-payments/${id}`, { paidAmount: amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      setShowPayModal(false);
      setSelectedPayment(null);
    },
  });

  const openPayModal = (payment: Payment) => {
    setSelectedPayment(payment);
    setPayAmount(String(payment.amount - payment.paidAmount));
    setShowPayModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CreditCard size={18} className="text-orange-500" />
        <div>
          <h1 className="page-title">지불 관리</h1>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign size={12} className="text-slate-400" />
            <span className="card-label">총 금액</span>
          </div>
          <div className="card-value tabular-nums">{formatKRW(summary.totalAmount)}원</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={12} className="text-green-500" />
            <span className="card-label">지급 완료</span>
          </div>
          <div className="card-value text-green-600 tabular-nums">{formatKRW(summary.totalPaid)}원</div>
        </div>
        <div className="card border-red-200">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={12} className="text-red-500" />
            <span className="card-label">총 미지급</span>
          </div>
          <div className="card-value text-red-600 tabular-nums">{formatKRW(summary.totalUnpaid)}원</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['unpaid', 'partial', 'paid'] as const).map((key) => {
          const cfg = TAB_CONFIG[key];
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === key ? 'bg-orange-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={12} /> {cfg.label} ({counts[key]})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">지불 내역</h3>
          <span className="text-xs text-slate-400">{payments.length}건</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>매입처</th>
                <th className="text-right">청구 금액</th>
                <th className="text-right">지급 금액</th>
                <th className="text-right">잔액</th>
                <th>지불기한</th>
                <th className="text-center">상태</th>
                <th className="text-center">결제</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const remaining = p.amount - p.paidAmount;
                const cfg = TAB_CONFIG[p.status] || TAB_CONFIG.unpaid;
                const StatusIcon = cfg.icon;
                return (
                  <tr key={p.id}>
                    <td className="font-medium text-slate-900">{p.supplierName}</td>
                    <td className="text-right tabular-nums font-semibold">{formatKRW(p.amount)}원</td>
                    <td className="text-right tabular-nums text-green-600">{formatKRW(p.paidAmount)}원</td>
                    <td className={`text-right tabular-nums font-semibold ${remaining > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {remaining > 0 ? `${formatKRW(remaining)}원` : '-'}
                    </td>
                    <td className="text-xs text-slate-500 tabular-nums">
                      {p.dueDate ? new Date(p.dueDate).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                        p.status === 'paid' ? 'bg-green-50 text-green-600' : p.status === 'partial' ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'
                      }`}>
                        <StatusIcon size={10} /> {cfg.label}
                      </span>
                    </td>
                    <td className="text-center">
                      {p.status !== 'paid' && (
                        <button onClick={() => openPayModal(p)} className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium hover:bg-orange-200">
                          결제
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {payments.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400 text-sm">데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay Modal */}
      {showPayModal && selectedPayment && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">결제 처리</h2>
              <button onClick={() => setShowPayModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-slate-500">매입처</span>
                  <span className="font-medium">{selectedPayment.supplierName}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-500">청구 금액</span>
                  <span className="font-semibold">{formatKRW(selectedPayment.amount)}원</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-500">기 지급</span>
                  <span className="text-green-600">{formatKRW(selectedPayment.paidAmount)}원</span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="text-slate-500 font-medium">잔액</span>
                  <span className="font-bold text-red-600">{formatKRW(selectedPayment.amount - selectedPayment.paidAmount)}원</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">결제 금액</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-right"
                  placeholder="0"
                />
              </div>
              <button
                onClick={() => selectedPayment && payMutation.mutate({ id: selectedPayment.id, amount: Number(payAmount) })}
                disabled={payMutation.isPending}
                className="w-full py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                결제 처리
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
