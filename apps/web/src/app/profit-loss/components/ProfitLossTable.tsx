'use client';

import type { ReactNode } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatKRW, formatPercent, getGradeColor, getProfitColor } from '@/lib/utils';
import type { PLData } from '@kiditem/shared';

export type SortField =
  | 'revenue' | 'costOfGoods' | 'commission' | 'shippingCost'
  | 'adCost' | 'netProfit' | 'profitRate' | 'orderCount';

interface Props {
  data: PLData[];
  filtered: PLData[];
  filter: string;
  onFilter: (f: string) => void;
  selectedGrades: string[];
  onToggleGrade: (grade: string) => void;
  onResetGrades: () => void;
  sortField: SortField | null;
  sortDirection: 'asc' | 'desc' | null;
  onToggleSort: (field: SortField) => void;
}

export default function ProfitLossTable({
  data, filtered, filter, onFilter,
  selectedGrades, onToggleGrade, onResetGrades,
  sortField, sortDirection, onToggleSort,
}: Props) {
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field || !sortDirection) {
      return <ArrowUpDown size={14} className="text-slate-400" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp size={14} className="text-blue-600" />;
    }
    return <ArrowDown size={14} className="text-blue-600" />;
  };

  return (
    <>
      {/* 이익률 필터 */}
      <div className="flex gap-2">
        {[
          { key: "all", label: `전체 (${data.length})` },
          { key: "minus", label: `적자 (${data.filter(d => d.profitRate < 0).length})`, color: "text-red-600" },
          { key: "low", label: `3%이하 (${data.filter(d => d.profitRate >= 0 && d.profitRate <= 3).length})`, color: "text-orange-600" },
          { key: "normal", label: `정상 (${data.filter(d => d.profitRate > 3).length})`, color: "text-green-600" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => onFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? "bg-blue-600 text-white" : `bg-white border border-slate-200 hover:bg-slate-50 ${f.color || "text-slate-700"}`}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 등급 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-600">등급</span>
        <button
          onClick={onResetGrades}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedGrades.length === 0
              ? "bg-slate-900 text-white"
              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          전체
        </button>
        {(["A", "B", "C"] as const).map((grade) => (
          <button
            key={grade}
            onClick={() => onToggleGrade(grade)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              selectedGrades.includes(grade)
                ? `${getGradeColor(grade)} border-transparent`
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {grade}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="table-card">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>등급</th>
                <th>상품명</th>
                <th>회사</th>
                <SortableHeader label="매출" align="right" icon={renderSortIcon("revenue")} onClick={() => onToggleSort("revenue")} />
                <SortableHeader label="매입원가" align="right" icon={renderSortIcon("costOfGoods")} onClick={() => onToggleSort("costOfGoods")} />
                <SortableHeader label="수수료" align="right" icon={renderSortIcon("commission")} onClick={() => onToggleSort("commission")} />
                <SortableHeader label="배송비" align="right" icon={renderSortIcon("shippingCost")} onClick={() => onToggleSort("shippingCost")} />
                <SortableHeader label="광고비" align="right" icon={renderSortIcon("adCost")} onClick={() => onToggleSort("adCost")} />
                <th className="text-right">기타비용</th>
                <SortableHeader label="순이익" align="right" icon={renderSortIcon("netProfit")} onClick={() => onToggleSort("netProfit")} />
                <SortableHeader label="이익률" align="right" icon={renderSortIcon("profitRate")} onClick={() => onToggleSort("profitRate")} />
                <SortableHeader label="주문수" align="right" icon={renderSortIcon("orderCount")} onClick={() => onToggleSort("orderCount")} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="empty-state">해당 기간 데이터가 없습니다.</td>
                </tr>
              ) : filtered.map((d) => (
                <tr key={d.id} className={d.profitRate < 0 ? "bg-red-50/50" : d.profitRate <= 3 ? "bg-orange-50/30" : ""}>
                  <td><span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(d.grade)}`}>{d.grade}</span></td>
                  <td className="font-medium text-slate-900">{d.productName}</td>
                  <td className="text-slate-500 text-xs">{d.company}</td>
                  <td className="text-right tabular-nums">{formatKRW(d.revenue)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(d.costOfGoods)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(d.commission)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(d.shippingCost)}</td>
                  <td className="text-right tabular-nums text-orange-600">{formatKRW(d.adCost)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(d.otherCost)}</td>
                  <td className={`text-right tabular-nums font-semibold ${getProfitColor(d.profitRate)}`}>{formatKRW(d.netProfit)}</td>
                  <td className={`text-right tabular-nums font-semibold ${getProfitColor(d.profitRate)}`}>{formatPercent(d.profitRate)}</td>
                  <td className="text-right tabular-nums text-slate-600">{d.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SortableHeader({
  label, align, icon, onClick,
}: {
  label: string;
  align?: 'left' | 'right';
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <th className={`${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'ml-auto justify-end' : ''} hover:text-slate-900`}
      >
        <span>{label}</span>
        {icon}
      </button>
    </th>
  );
}
