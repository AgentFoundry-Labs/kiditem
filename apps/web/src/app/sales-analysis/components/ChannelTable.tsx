'use client';
import { ArrowUpDown, ArrowUp, ArrowDown, BarChart3 } from 'lucide-react';
import { cn, formatKRW, formatNumber, formatPercent } from '@/lib/utils';

interface ChannelRow {
  channelName: string;
  channelType: string;
  totalOrders: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  returnCount: number;
  returnRate: number;
  avgOrderValue: number;
}

export type ChannelSortField =
  | 'totalOrders' | 'totalRevenue' | 'totalCost' | 'totalProfit' | 'avgOrderValue';

interface Props {
  channels: ChannelRow[];
  sortField: ChannelSortField | null;
  sortDirection: 'asc' | 'desc' | null;
  onToggleSort: (field: ChannelSortField) => void;
}

export function ChannelTable({ channels, sortField, sortDirection, onToggleSort }: Props) {
  if (channels.length === 0) {
    return (
      <div className="card p-12 text-center">
        <BarChart3 size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-500">매출 데이터가 없습니다</p>
      </div>
    );
  }

  const renderSortIcon = (field: ChannelSortField) => {
    if (sortField !== field || !sortDirection) {
      return <ArrowUpDown size={14} className="text-slate-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-purple-600" />
      : <ArrowDown size={14} className="text-purple-600" />;
  };

  const SortTh = ({ field, children, className = '' }: { field: ChannelSortField; children: React.ReactNode; className?: string }) => (
    <th className={className}>
      <button
        type="button"
        onClick={() => onToggleSort(field)}
        className="inline-flex items-center gap-1 hover:text-purple-600"
        aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {children}
        {renderSortIcon(field)}
      </button>
    </th>
  );

  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>채널명</th>
              <th>유형</th>
              <SortTh field="totalOrders" className="text-right">주문수</SortTh>
              <SortTh field="totalRevenue" className="text-right">매출</SortTh>
              <SortTh field="totalCost" className="text-right">비용</SortTh>
              <SortTh field="totalProfit" className="text-right">이익</SortTh>
              <th className="text-right">이익률</th>
              <th className="text-right">반품수</th>
              <th className="text-right">반품률</th>
              <SortTh field="avgOrderValue" className="text-right">평균주문금액</SortTh>
            </tr>
          </thead>
          <tbody>
            {channels.map((row) => {
              const margin = row.totalRevenue > 0 ? (row.totalProfit / row.totalRevenue) * 100 : 0;
              return (
              <tr key={row.channelName}>
                <td>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    {row.channelName}
                  </span>
                </td>
                <td className="text-sm text-slate-700">{row.channelType}</td>
                <td className="text-right tabular-nums">{formatNumber(row.totalOrders)}</td>
                <td className="text-right tabular-nums">{formatKRW(row.totalRevenue)}</td>
                <td className="text-right tabular-nums">{formatKRW(row.totalCost)}</td>
                <td className={cn('text-right tabular-nums font-medium', row.totalProfit >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {formatKRW(row.totalProfit)}
                </td>
                <td className={cn('text-right tabular-nums', margin >= 10 ? 'text-green-600' : margin >= 0 ? 'text-orange-500' : 'text-red-600')}>
                  {formatPercent(margin)}
                </td>
                <td className="text-right tabular-nums">{formatNumber(row.returnCount)}</td>
                <td className="text-right tabular-nums">{formatPercent(row.returnRate)}</td>
                <td className="text-right tabular-nums">{formatKRW(row.avgOrderValue)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
