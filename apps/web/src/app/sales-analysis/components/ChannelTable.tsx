'use client';
import { BarChart3 } from 'lucide-react';
import { formatKRW, formatNumber, formatPercent } from '@/lib/utils';

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

interface Props {
  channels: ChannelRow[];
}

export function ChannelTable({ channels }: Props) {
  if (channels.length === 0) {
    return (
      <div className="card p-12 text-center">
        <BarChart3 size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-500">매출 데이터가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>채널명</th>
              <th>유형</th>
              <th className="text-right">주문수</th>
              <th className="text-right">매출</th>
              <th className="text-right">비용</th>
              <th className="text-right">이익</th>
              <th className="text-right">이익률</th>
              <th className="text-right">반품수</th>
              <th className="text-right">반품률</th>
              <th className="text-right">평균주문금액</th>
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
                <td className={`text-right tabular-nums font-medium ${row.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatKRW(row.totalProfit)}
                </td>
                <td className={`text-right tabular-nums ${margin >= 10 ? 'text-green-600' : margin >= 0 ? 'text-orange-500' : 'text-red-600'}`}>
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
