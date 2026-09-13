'use client';

import { cn, formatKRW, formatNumber, formatPercent } from '@/lib/utils';
import SortableHeader from '@/components/ui/SortableHeader';
import type { ChannelAnalysis } from '@kiditem/shared/finance';

type SortField = 'totalOrders' | 'totalRevenue' | 'totalCost' | 'totalProfit' | 'avgOrderValue';
type SortDir = 'asc' | 'desc' | null;

interface Props {
  channels: ChannelAnalysis[];
  sortField: SortField | null;
  sortDir: SortDir;
  onToggleSort: (field: SortField) => void;
}

const CHANNEL_TYPE_LABEL: Record<ChannelAnalysis['channelType'], string> = {
  marketplace: '마켓',
  direct: '자사몰',
  other: '기타',
};

function profitTone(profit: number | null): string {
  if (profit === null) return 'text-slate-400';
  return profit >= 0 ? 'text-green-600' : 'text-red-600';
}

function marginTone(rate: number | null): string {
  if (rate === null) return 'text-slate-400';
  if (rate >= 10) return 'text-green-600';
  return rate >= 0 ? 'text-orange-500' : 'text-red-600';
}

export default function ChannelTable({ channels, sortField, sortDir, onToggleSort }: Props) {
  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>채널</th>
              <th>타입</th>
              <SortableHeader<SortField> field="totalOrders" label="주문 수" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
              <SortableHeader<SortField> field="totalRevenue" label="매출" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
              <SortableHeader<SortField> field="totalCost" label="총비용" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
              <SortableHeader<SortField> field="totalProfit" label="순이익" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
              <th className="text-right">이익률</th>
              <th className="text-right">반품 수</th>
              <th className="text-right">반품률</th>
              <SortableHeader<SortField> field="avgOrderValue" label="평균 주문가" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.channel}>
                <td>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    {c.channel}
                  </span>
                </td>
                <td className="text-sm text-slate-700">{CHANNEL_TYPE_LABEL[c.channelType]}</td>
                <td className="text-right tabular-nums">{formatNumber(c.totalOrders)}</td>
                <td className="text-right tabular-nums">{formatKRW(c.totalRevenue)}</td>
                <td className="text-right tabular-nums">{formatKRW(c.totalCost)}</td>
                <td className={cn('text-right tabular-nums font-medium', profitTone(c.totalProfit))}>
                  {formatKRW(c.totalProfit)}
                </td>
                <td className={cn('text-right tabular-nums', marginTone(c.profitRate))}>
                  {formatPercent(c.profitRate)}
                </td>
                <td className="text-right tabular-nums">{formatNumber(c.returnCount)}</td>
                <td className="text-right tabular-nums">
                  {formatPercent(c.returnRate === null ? null : c.returnRate * 100)}
                </td>
                <td className="text-right tabular-nums">{formatKRW(c.avgOrderValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
