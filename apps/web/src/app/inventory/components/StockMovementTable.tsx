'use client';
import { ArrowUpDown } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';

export interface GroupedRow {
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

const GROUP_COLUMN_LABEL: Record<string, string> = {
  product: '상품',
  date: '날짜',
  type: '유형',
};

interface Props {
  grouped: GroupedRow[];
  loading: boolean;
  groupBy: string;
}

export function StockMovementTable({ grouped, loading, groupBy }: Props) {
  function formatGroupKey(key: string) {
    if (groupBy === 'type') return TYPE_LABEL[key] || key;
    return key;
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-2 py-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-slate-100 rounded" />
        ))}
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="py-20 text-center">
        <ArrowUpDown size={40} className="mx-auto text-slate-300 mb-3" />
        <p className="text-slate-500">입출고 이력이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
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
                  <td className="font-medium text-slate-900 max-w-[250px] truncate">
                    {formatGroupKey(row.key)}
                  </td>
                  <td className="text-right tabular-nums text-green-600">+{formatKRW(row.inQty)}</td>
                  <td className="text-right tabular-nums text-red-600">-{formatKRW(row.outQty)}</td>
                  <td className="text-right tabular-nums text-slate-700">{formatKRW(row.inAmt)}원</td>
                  <td className="text-right tabular-nums text-slate-700">{formatKRW(row.outAmt)}원</td>
                  <td className={cn('text-right tabular-nums font-semibold', net > 0 ? 'text-green-600' : net < 0 ? 'text-red-600' : 'text-slate-500')}>
                    {net > 0 ? '+' : ''}{formatKRW(net)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
