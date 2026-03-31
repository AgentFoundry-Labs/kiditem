'use client';

import { useEffect, useState, useCallback } from 'react';
import { ArrowUpDown, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { formatKRW } from '@/lib/utils';

interface Summary {
  inQty: number;
  outQty: number;
  inAmount: number;
  outAmount: number;
}

interface GroupedRow {
  key: string;
  inQty: number;
  outQty: number;
  inAmt: number;
  outAmt: number;
}

const TYPE_LABEL: Record<string, string> = {
  in: '입고',
  out: '출고',
  purchase: '매입입고',
  return_in: '반품입고',
  sale: '판매출고',
  adjustment: '조정',
  unknown: '기타',
};

const GROUP_TABS = [
  { key: 'product', label: '상품별' },
  { key: 'date', label: '일자별' },
  { key: 'type', label: '유형별' },
] as const;

const PERIOD_OPTIONS = [
  { value: '1', label: '오늘' },
  { value: '7', label: '7일' },
  { value: '30', label: '30일' },
  { value: '90', label: '90일' },
] as const;

const GROUP_COLUMN_LABEL: Record<string, string> = {
  product: '상품',
  date: '날짜',
  type: '유형',
};

export default function StockMovementPage() {
  const [summary, setSummary] = useState<Summary>({ inQty: 0, outQty: 0, inAmount: 0, outAmount: 0 });
  const [grouped, setGrouped] = useState<GroupedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<string>('product');
  const [dateRange, setDateRange] = useState('30');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const daysMap: Record<string, number> = { '1': 1, '7': 7, '30': 30, '90': 90 };
      const days = daysMap[dateRange] || 7;
      const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const data = await apiClient.get<{ total: number; grouped: any[]; summary: Summary }>(
        `/api/stock-movement?from=${from}&groupBy=${groupBy}&limit=500`,
      );
      setTotal(data.total || 0);
      setGrouped(data.grouped || []);
      setSummary(data.summary || { inQty: 0, outQty: 0, inAmount: 0, outAmount: 0 });
      setError(null);
    } catch (err) {
      setError(isApiError(err) ? err.detail : '입출고 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, groupBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatGroupKey = (key: string) => {
    if (groupBy === 'type') return TYPE_LABEL[key] || key;
    return key;
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowUpDown size={20} className="text-indigo-500" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">입출고 현황</h1>
            <p className="text-sm text-gray-500">{total}건 거래 내역</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  dateRange === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          icon={<TrendingUp size={14} className="text-green-500" />}
          label="입고 수량"
          value={formatKRW(summary.inQty)}
          color="text-green-700"
        />
        <SummaryCard
          icon={<TrendingDown size={14} className="text-red-500" />}
          label="출고 수량"
          value={formatKRW(summary.outQty)}
          color="text-red-600"
        />
        <SummaryCard
          icon={<TrendingUp size={14} className="text-green-500" />}
          label="입고 금액"
          value={`${formatKRW(summary.inAmount)}원`}
          color="text-green-700"
        />
        <SummaryCard
          icon={<TrendingDown size={14} className="text-red-500" />}
          label="출고 금액"
          value={`${formatKRW(summary.outAmount)}원`}
          color="text-red-600"
        />
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {GROUP_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setGroupBy(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              groupBy === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2 py-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="py-20 text-center">
          <ArrowUpDown size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">입출고 이력이 없습니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>{GROUP_COLUMN_LABEL[groupBy]}</th>
                  <th className="text-right">입고수량</th>
                  <th className="text-right">출고수량</th>
                  <th className="text-right">입고금액</th>
                  <th className="text-right">출고금액</th>
                  <th className="text-right">순증감</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((row) => {
                  const net = row.inQty - row.outQty;
                  return (
                    <tr key={row.key}>
                      <td className="font-medium text-gray-900 max-w-[250px] truncate">
                        {formatGroupKey(row.key)}
                      </td>
                      <td className="text-right tabular-nums text-green-600">
                        +{formatKRW(row.inQty)}
                      </td>
                      <td className="text-right tabular-nums text-red-600">
                        -{formatKRW(row.outQty)}
                      </td>
                      <td className="text-right tabular-nums text-gray-700">
                        {formatKRW(row.inAmt)}원
                      </td>
                      <td className="text-right tabular-nums text-gray-700">
                        {formatKRW(row.outAmt)}원
                      </td>
                      <td className={`text-right tabular-nums font-semibold ${
                        net > 0 ? 'text-green-600' : net < 0 ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        {net > 0 ? '+' : ''}{formatKRW(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
