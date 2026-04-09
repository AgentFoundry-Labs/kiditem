'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  CheckCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  FileSearch,
  Download,
  Loader2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatKRW } from '@/lib/utils';

interface Settlement {
  id: string;
  period: string;
  expectedAmount: number;
  actualAmount: number;
  commission: number;
  shippingFee: number;
  adjustments: number;
  difference: number;
  orderCount: number;
  returnCount: number;
  status: string;
  settledAt: string | null;
  notes: string | null;
}

interface ReconcileDetail {
  productId: string;
  productName: string;
  sku: string;
  plRevenue: number;
  plCommission: number;
  plNetProfit: number;
  plOrderCount: number;
  orderTotal: number;
  orderCount: number;
  revenueDiff: number;
  isMatched: boolean;
  status: string;
}

interface ReconcileResult {
  period: string;
  summary: {
    totalPlRevenue: number;
    totalOrderRevenue: number;
    totalCommission: number;
    totalShipping: number;
    revenueDifference: number;
    productCount: number;
    orderCount: number;
    matchedCount: number;
    mismatchCount: number;
    matchRate: number;
  };
  details: ReconcileDetail[];
}

export default function Settlements() {
  const queryClient = useQueryClient();

  const { data: settlements = [] } = useQuery({
    queryKey: queryKeys.settlements.all,
    queryFn: () => apiClient.get<Settlement[]>('/api/settlements'),
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [actualAmount, setActualAmount] = useState(0);
  const [reconcilePeriod, setReconcilePeriod] = useState('');

  const reconcileMutation = useMutation({
    mutationFn: (period: string) =>
      apiClient.post<ReconcileResult>('/api/settlements/reconcile', { period }),
  });
  const reconcile = reconcileMutation.data ?? null;

  const confirmMutation = useMutation({
    mutationFn: ({ id, actualAmount: amt }: { id: string; actualAmount: number }) =>
      apiClient.patch(`/api/settlements/${id}`, { status: 'confirmed', actualAmount: amt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      setEditId(null);
    },
  });

  const handleConfirm = (s: Settlement) => {
    confirmMutation.mutate({ id: s.id, actualAmount });
  };

  const totalExpected = settlements.reduce((s, t) => s + t.expectedAmount, 0);
  const totalActual = settlements.filter(s => s.status === 'confirmed').reduce((s, t) => s + t.actualAmount, 0);
  const totalDiff = settlements.filter(s => s.status === 'confirmed').reduce((s, t) => s + t.difference, 0);

  return (
    <div className="space-y-6">
      <h1 className="page-title"><Wallet size={24} className="inline mr-2" />정산 관리</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card"><div className="card-label">총 예상 정산액</div><div className="card-value">{formatKRW(totalExpected)}</div></div>
        <div className="card"><div className="card-label">확인된 입금액</div><div className="card-value text-green-600">{formatKRW(totalActual)}</div></div>
        <div className="card"><div className="card-label">차이 합계</div><div className={`card-value ${totalDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{totalDiff >= 0 ? '+' : ''}{formatKRW(totalDiff)}</div></div>
        <div className="card"><div className="card-label">미확인 월</div><div className="card-value text-orange-600">{settlements.filter(s => s.status === 'pending').length}건</div></div>
      </div>

      {/* 정산 테이블 */}
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>정산 월</th>
              <th className="text-right">주문/반품</th>
              <th className="text-right">수수료</th>
              <th className="text-right">예상 정산액</th>
              <th className="text-right">실제 입금액</th>
              <th className="text-right">차이</th>
              <th className="text-center">상태</th>
              <th className="text-center">확인</th>
            </tr>
          </thead>
          <tbody >
            {settlements.map(s => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{s.period}</td>
                <td className="px-4 py-3 text-right text-xs"><span className="text-purple-600">{s.orderCount}건</span> / <span className="text-red-500">{s.returnCount}건</span></td>
                <td className="px-4 py-3 text-right">{formatKRW(s.commission)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatKRW(s.expectedAmount)}</td>
                <td className="px-4 py-3 text-right">
                  {editId === s.id ? (
                    <input type="number" value={actualAmount} onChange={e => setActualAmount(Number(e.target.value))} className="w-32 px-2 py-1 border rounded text-right text-sm" autoFocus />
                  ) : (
                    <span className={s.status === 'confirmed' ? 'font-medium text-green-600' : 'text-slate-400'}>{s.status === 'confirmed' ? formatKRW(s.actualAmount) : '미입력'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.status === 'confirmed' && (
                    <span className={`flex items-center justify-end gap-0.5 font-medium ${s.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {s.difference >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{s.difference >= 0 ? '+' : ''}{formatKRW(s.difference)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {s.status === 'confirmed' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle size={12} />확인</span>
                  ) : s.status === 'disputed' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-red-600"><AlertTriangle size={12} />이의</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock size={12} />대기</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {editId === s.id ? (
                    <button onClick={() => handleConfirm(s)} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">저장</button>
                  ) : s.status !== 'confirmed' ? (
                    <button onClick={() => { setEditId(s.id); setActualAmount(s.expectedAmount); }} className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700">입금확인</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {settlements.length === 0 && <div className="empty-state">정산 데이터가 없습니다. 손익 데이터가 생성되면 자동으로 표시됩니다.</div>}
      </div>

      {/* 정산 대사 매칭 */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileSearch size={18} className="text-indigo-600" />
            <h2 className="section-title">정산 대사 (주문-정산 매칭)</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="border border-slate-200 rounded-md px-3 py-1.5 text-sm"
              value={reconcilePeriod || settlements[0]?.period || ''}
              onChange={(e) => setReconcilePeriod(e.target.value)}
            >
              {settlements.map((s) => <option key={s.id} value={s.period}>{s.period}</option>)}
            </select>
            <button
              onClick={() => {
                const p = reconcilePeriod || settlements[0]?.period;
                if (p) reconcileMutation.mutate(p);
              }}
              disabled={reconcileMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {reconcileMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <FileSearch size={12} />}
              대사 실행
            </button>
          </div>
        </div>

        {reconcile && (
          <div className="space-y-4">
            {/* 매칭 요약 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-indigo-50 rounded-lg p-3 text-center">
                <div className="text-xs text-indigo-600">매칭률</div>
                <div className="text-lg font-bold text-indigo-700">{reconcile.summary.matchRate}%</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-xs text-green-600">매칭 완료</div>
                <div className="text-lg font-bold text-green-700">{reconcile.summary.matchedCount}건</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-xs text-red-600">불일치</div>
                <div className="text-lg font-bold text-red-700">{reconcile.summary.mismatchCount}건</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-600">손익 매출합</div>
                <div className="text-sm font-bold text-slate-900">{formatKRW(reconcile.summary.totalPlRevenue)}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-600">주문 매출합</div>
                <div className="text-sm font-bold text-slate-900">{formatKRW(reconcile.summary.totalOrderRevenue)}</div>
              </div>
            </div>

            {/* 매칭 상세 테이블 */}
            <div className="table-scroll">
              <table className="text-xs">
                <thead className="sticky top-0">
                  <tr>
                    <th>상품명</th>
                    <th className="text-right">손익 매출</th>
                    <th className="text-right">주문 합계</th>
                    <th className="text-right">차이</th>
                    <th className="text-right">손익건수</th>
                    <th className="text-right">주문건수</th>
                    <th className="text-center">상태</th>
                  </tr>
                </thead>
                <tbody >
                  {reconcile.details.map((d) => (
                    <tr key={d.productId} className={d.status === 'mismatch' ? 'bg-red-50/50' : d.status === 'minor_diff' ? 'bg-yellow-50/50' : ''}>
                      <td className="px-3 py-2 font-medium text-slate-900 max-w-[200px] truncate">{d.productName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatKRW(d.plRevenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatKRW(d.orderTotal)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${d.revenueDiff > 0 ? 'text-green-600' : d.revenueDiff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {d.revenueDiff !== 0 ? `${d.revenueDiff > 0 ? '+' : ''}${formatKRW(d.revenueDiff)}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.plOrderCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.orderCount}</td>
                      <td className="px-3 py-2 text-center">
                        {d.status === 'matched' ? (
                          <span className="inline-flex items-center gap-0.5 text-green-600"><CheckCircle size={10} />매칭</span>
                        ) : d.status === 'minor_diff' ? (
                          <span className="inline-flex items-center gap-0.5 text-yellow-600"><AlertTriangle size={10} />소차이</span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-red-600 font-medium"><AlertTriangle size={10} />불일치</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 엑셀 내보내기 */}
            <button
              onClick={() => {
                if (!reconcile) return;
                import("xlsx").then((XLSX) => {
                  const ws = XLSX.utils.json_to_sheet(reconcile.details.map((d) => ({
                    상품명: d.productName, SKU: d.sku, 손익매출: d.plRevenue,
                    주문합계: d.orderTotal, 차이: d.revenueDiff,
                    손익건수: d.plOrderCount, 주문건수: d.orderCount,
                    상태: d.status === 'matched' ? '매칭' : d.status === 'minor_diff' ? '소차이' : '불일치',
                  })));
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "정산대사");
                  XLSX.writeFile(wb, `정산대사_${reconcile.period}.xlsx`);
                });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-md hover:bg-green-700"
            >
              <Download size={12} /> 엑셀 내보내기
            </button>
          </div>
        )}

        {!reconcile && !reconcileMutation.isPending && (
          <div className="empty-state">
            정산 월을 선택하고 &quot;대사 실행&quot;을 클릭하면 주문-정산 건별 매칭 결과를 확인할 수 있습니다.
          </div>
        )}
      </div>

      <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 text-sm text-purple-800">
        <TrendingUp size={16} className="inline mr-1" /><strong>팁:</strong> 쿠팡 셀러 오피스에서 정산 내역을 확인한 후, 실제 입금액을 입력하면 차이를 자동 대조합니다. 차이가 크면 수수료 오류나 반품 미반영을 확인하세요.
      </div>
    </div>
  );
}
