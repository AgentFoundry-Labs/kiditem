'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  CheckCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Receipt,
} from 'lucide-react';
import { SettlementListResponseSchema, type SettlementListItem } from '@kiditem/shared/settlements';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW } from '@/lib/utils';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { compareNullableLast } from '@/lib/nullable-sort';

type Settlement = SettlementListItem;

type SortField = 'expectedAmount' | 'actualAmount' | 'difference';

export default function Settlements() {
  const queryClient = useQueryClient();

  // All hooks must be called before any conditional returns (Rules of Hooks)
  const { period, setPeriod, periodOptions } = usePeriodSelector({ months: 24, defaultTo: 'prev' });

  const allPeriodOptions = useMemo(() => [
    { value: '', label: '전체' },
    ...Array.from(new Set(periodOptions.map(o => o.value.slice(0, 4)))).map(y => ({
      value: y,
      label: `${y}년`,
    })),
    ...periodOptions,
  ], [periodOptions]);

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [actualAmount, setActualAmount] = useState(0);

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.settlements.list(period),
    queryFn: () => {
      const params = new URLSearchParams();
      if (period) params.set('period', period);
      return apiClient.getParsed(`/api/settlements?${params}`, SettlementListResponseSchema);
    },
    placeholderData: previousData => previousData,
  });
  const settlements: Settlement[] = data?.items ?? [];
  // Card totals are the server's sums; the browser adds nothing up.
  const summary = data?.summary ?? null;
  const isRefreshing = isFetching && settlements.length > 0;

  const confirmMutation = useMutation({
    mutationFn: ({ id, actualAmount: amt }: { id: string; actualAmount: number }) =>
      apiClient.patch(`/api/settlements/${id}`, { status: 'confirmed', actualAmount: amt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements.all });
      setEditId(null);
    },
  });

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else if (sortDirection === 'asc') {
        setSortDirection(null);
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortField || !sortDirection) return settlements;
    return [...settlements].sort((a, b) => compareNullableLast(a[sortField], b[sortField], sortDirection));
  }, [settlements, sortField, sortDirection]);

  const handleConfirm = (s: Settlement) => {
    confirmMutation.mutate({ id: s.id, actualAmount });
  };

  const totalDiff = summary?.totalConfirmedDifference ?? null;

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field || !sortDirection) {
      return <ArrowUpDown size={14} className="text-slate-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-purple-600" />
      : <ArrowDown size={14} className="text-purple-600" />;
  };

  const SortTh = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th className={className}>
      <button
        type="button"
        onClick={() => handleToggleSort(field)}
        className="inline-flex items-center gap-1 hover:text-purple-600"
        aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {children}
        {renderSortIcon(field)}
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title"><Wallet size={24} className="inline mr-2" />정산 관리</h1>
        <PeriodSelector
          value={period}
          onChange={setPeriod}
          options={allPeriodOptions}
        />
      </div>

      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm" aria-live="polite">
          <RefreshCw size={14} className="animate-spin text-purple-600" />
          정산 데이터를 갱신 중입니다.
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card"><div className="card-label">총 예상 정산액</div><div className="card-value">{formatKRW(summary?.totalExpected)}</div></div>
        <div className="card"><div className="card-label">확인된 입금액</div><div className="card-value text-green-600">{formatKRW(summary?.totalConfirmedActual)}</div></div>
        <div className="card"><div className="card-label">확인된 차이 합계</div><div className={cn('card-value', totalDiff === null || totalDiff >= 0 ? 'text-green-600' : 'text-red-600')}>{totalDiff === null ? '-' : `${totalDiff >= 0 ? '+' : ''}${formatKRW(totalDiff)}`}</div></div>
        <div className="card"><div className="card-label">미확인 월</div><div className="card-value text-orange-600">{summary === null || summary.pendingCount === null ? '-' : `${summary.pendingCount}건`}</div></div>
      </div>

      {/* 정산 테이블 */}
      {sorted.length === 0 ? (
        <div className="card p-12 text-center">
          <Receipt size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 mb-3">선택한 기간에 정산 데이터가 없습니다</p>
          <button onClick={() => setPeriod('')} className="text-sm text-purple-600 hover:underline">
            전체 기간 보기
          </button>
        </div>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>정산 월</th>
                <th className="text-right">주문/반품</th>
                <th className="text-right">수수료</th>
                <SortTh field="expectedAmount" className="text-right">예상정산액</SortTh>
                <SortTh field="actualAmount" className="text-right">실제입금액</SortTh>
                <SortTh field="difference" className="text-right">차이</SortTh>
                <th className="text-center">상태</th>
                <th className="text-center">확인</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{s.period}</td>
                  <td className="px-4 py-3 text-right text-xs"><span className="text-purple-600">{s.orderCount}건</span> / <span className="text-red-500">{s.returnCount}건</span></td>
                  <td className="px-4 py-3 text-right">{formatKRW(s.commission)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatKRW(s.expectedAmount)}</td>
                  <td className="px-4 py-3 text-right">
                    {editId === s.id ? (
                      <input type="number" value={actualAmount} onChange={e => setActualAmount(Number(e.target.value))} className="w-32 px-2 py-1 border rounded text-right text-sm" autoFocus />
                    ) : (
                      <span className={s.actualAmount === null ? 'text-slate-400' : 'font-medium text-green-600'}>{s.actualAmount === null ? '미입력' : formatKRW(s.actualAmount)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.difference !== null && (
                      <span className={cn('flex items-center justify-end gap-0.5 font-medium', s.difference >= 0 ? 'text-green-600' : 'text-red-600')}>
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
        </div>
      )}

      <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 text-sm text-purple-800">
        <TrendingUp size={16} className="inline mr-1" /><strong>팁:</strong> 쿠팡 셀러 오피스에서 정산 내역을 확인한 후, 실제 입금액을 입력하면 차이를 자동 대조합니다. 차이가 크면 수수료 오류나 반품 미반영을 확인하세요.
      </div>
    </div>
  );
}
