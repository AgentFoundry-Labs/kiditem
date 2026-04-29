'use client';

import { cn, formatKRW, formatPercent, getGradeColor, getProfitColor } from '@/lib/utils';
import type { PLData } from '@kiditem/shared/finance';
import SortableHeader from '@/components/ui/SortableHeader';

// Plan D.1 T7 note: `orderCount` is intentionally NOT sortable — the plan narrows
// sortable dimensions to the 8 financial fields below. Pre-T7 users could sort by
// 주문수 but that adds little P&L analysis value vs revenue/profit columns.
// If user feedback requires it, re-add 'orderCount' here and wire the <th>주문수</th>.
export type SortField =
  | 'revenue' | 'cogs' | 'commission' | 'shippingCost'
  | 'adCost' | 'otherCost' | 'netProfit' | 'profitRate';

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
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors', filter === f.key ? 'bg-purple-600 text-white' : cn('bg-white border border-slate-200 hover:bg-slate-50', f.color || 'text-slate-700'))}
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
          className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', selectedGrades.length === 0 ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50')}
        >
          전체
        </button>
        {(["A", "B", "C"] as const).map((grade) => (
          <button
            key={grade}
            onClick={() => onToggleGrade(grade)}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors', selectedGrades.includes(grade) ? cn(getGradeColor(grade), 'border-transparent') : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50')}
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
                <th>SKU</th>
                <th>회사</th>
                <SortableHeader<SortField>
                  field="revenue"
                  label="매출"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onToggleSort}
                  align="right"
                />
                <SortableHeader<SortField>
                  field="cogs"
                  label="매입원가"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onToggleSort}
                  align="right"
                />
                <SortableHeader<SortField>
                  field="commission"
                  label="수수료"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onToggleSort}
                  align="right"
                />
                <SortableHeader<SortField>
                  field="shippingCost"
                  label="배송비"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onToggleSort}
                  align="right"
                />
                <SortableHeader<SortField>
                  field="adCost"
                  label="광고비"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onToggleSort}
                  align="right"
                />
                <SortableHeader<SortField>
                  field="otherCost"
                  label="기타비용"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onToggleSort}
                  align="right"
                />
                <SortableHeader<SortField>
                  field="netProfit"
                  label="순이익"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onToggleSort}
                  align="right"
                />
                <SortableHeader<SortField>
                  field="profitRate"
                  label="이익률"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onToggleSort}
                  align="right"
                />
                <th className="text-right">주문수</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="empty-state">해당 기간 데이터가 없습니다.</td>
                </tr>
              ) : filtered.map((d) => (
                <tr key={d.listingId} className={d.profitRate < 0 ? "bg-red-50/50" : d.profitRate <= 3 ? "bg-orange-50/30" : ""}>
                  <td><span className={cn('px-2 py-0.5 rounded text-xs font-bold', getGradeColor(d.grade ?? ''))}>{d.grade}</span></td>
                  <td className="font-medium text-slate-900">{d.masterName}</td>
                  <td className="text-slate-500 text-xs font-mono">{d.masterCode ?? '-'}</td>
                  <td className="text-slate-500 text-xs">{d.channelName ?? '-'}</td>
                  <td className="text-right tabular-nums">{formatKRW(d.revenue)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(d.cogs)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(d.commission)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(d.shippingCost)}</td>
                  <td className="text-right tabular-nums text-orange-600">{formatKRW(d.adCost)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(d.otherCost)}</td>
                  <td className={cn('text-right tabular-nums font-semibold', getProfitColor(d.profitRate))}>{formatKRW(d.netProfit)}</td>
                  <td className={cn('text-right tabular-nums font-semibold', getProfitColor(d.profitRate))}>{formatPercent(d.profitRate)}</td>
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
