'use client';
import { Fragment, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUpdateMetrics } from '../hooks/useThumbnailTracking';
import type { ThumbnailTrackingRecord, UpdateMetricsInput } from '../hooks/useThumbnailTracking';

const GRADE_COLORS: Record<string, string> = {
  S: 'text-emerald-600 bg-emerald-50',
  A: 'text-blue-600 bg-blue-50',
  B: 'text-amber-600 bg-amber-50',
  C: 'text-orange-600 bg-orange-50',
  F: 'text-red-600 bg-red-50',
};

const STATUS_LABELS: Record<string, string> = {
  tracking: '추적 중',
  measured: '측정 완료',
  inconclusive: '결론 없음',
};

function CtrBadge({ value, muted }: { value: number | null; muted?: boolean }) {
  if (value == null) return <span className="text-slate-300 text-[13px]">—</span>;
  return (
    <span className={cn(
      'text-[12px] font-mono font-semibold px-1.5 py-0.5 rounded',
      muted ? 'text-slate-500 bg-slate-100' : 'text-blue-600 bg-blue-50',
    )}>
      {value.toFixed(2)}%
    </span>
  );
}

function CtrChange({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-300">—</span>;
  if (value > 0) return (
    <span className="flex items-center gap-0.5 text-emerald-600 font-semibold text-[13px]">
      <TrendingUp size={13} />+{value.toFixed(1)}%p
    </span>
  );
  if (value < 0) return (
    <span className="flex items-center gap-0.5 text-red-500 font-semibold text-[13px]">
      <TrendingDown size={13} />{value.toFixed(1)}%p
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-slate-400 text-[13px]">
      <Minus size={13} />0%p
    </span>
  );
}

function MetricsForm({ record, onClose }: { record: ThumbnailTrackingRecord; onClose: () => void }) {
  const updateMetrics = useUpdateMetrics();
  const [form, setForm] = useState<UpdateMetricsInput>({
    ctrAfter: record.ctrAfter ?? undefined,
    reviewsBefore: record.reviewsBefore ?? undefined,
    reviewsAfter: record.reviewsAfter ?? undefined,
  });

  const handleSave = async () => {
    try {
      await updateMetrics.mutateAsync({ id: record.id, input: form });
      toast.success('성과 지표 저장됨');
      onClose();
    } catch {
      toast.error('저장 실패');
    }
  };

  return (
    <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
      <div className="text-xs font-semibold text-slate-600 mb-1">성과 입력</div>

      {/* 기존 CTR (읽기 전용) */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
        <span className="text-[11px] text-blue-500 font-semibold">기존 CTR (적용 전)</span>
        <span className="text-[13px] font-mono font-bold text-blue-700">
          {record.ctrBefore != null ? `${record.ctrBefore.toFixed(2)}%` : '데이터 없음'}
        </span>
        <span className="text-[10px] text-blue-400 ml-auto">셀러인사이트 기준</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* CTR 적용 후 */}
        <div className="col-span-2">
          <label className="text-[11px] text-slate-400 block mb-0.5">CTR 적용 후 (%)</label>
          <input
            type="number"
            step="0.1"
            value={form.ctrAfter ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, ctrAfter: e.target.value ? parseFloat(e.target.value) : undefined }))}
            className="w-full px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="예: 3.1"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 block mb-0.5">리뷰 수 적용 전</label>
          <input
            type="number"
            value={form.reviewsBefore ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, reviewsBefore: e.target.value ? parseInt(e.target.value) : undefined }))}
            className="w-full px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="예: 150"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 block mb-0.5">리뷰 수 적용 후</label>
          <input
            type="number"
            value={form.reviewsAfter ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, reviewsAfter: e.target.value ? parseInt(e.target.value) : undefined }))}
            className="w-full px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="예: 178"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={updateMetrics.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Check size={12} /> 저장
        </button>
      </div>
    </div>
  );
}

interface TrackingTabProps {
  records: ThumbnailTrackingRecord[];
}

export function TrackingTab({ records }: TrackingTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'appliedAt' | 'daysElapsed' | 'ctrChange' | 'ctrBefore'>('appliedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...records].sort((a, b) => {
    let av: number, bv: number;
    if (sortKey === 'daysElapsed') { av = a.daysElapsed; bv = b.daysElapsed; }
    else if (sortKey === 'ctrChange') { av = a.ctrChange ?? -999; bv = b.ctrChange ?? -999; }
    else if (sortKey === 'ctrBefore') { av = a.ctrBefore ?? -999; bv = b.ctrBefore ?? -999; }
    else { av = new Date(a.appliedAt).getTime(); bv = new Date(b.appliedAt).getTime(); }
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k
      ? (sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)
      : null;

  // 요약 통계
  const measuredCount = records.filter((r) => r.status === 'measured').length;
  const trackingCount = records.filter((r) => r.status === 'tracking').length;
  const withCtrBefore = records.filter((r) => r.ctrBefore != null).length;
  const withCtrAfter = records.filter((r) => r.ctrAfter != null).length;

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
        <TrendingUp size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium">추적 중인 상품이 없습니다</p>
        <p className="text-xs mt-1">썸네일을 적용하면 자동으로 추적이 시작됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 헤더 요약 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-cyan-600" />
          <span className="text-sm font-bold text-slate-700">추적 현황 — {records.length}개 적용 완료</span>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-slate-400">
          <span>기존 CTR 확보 <span className="font-semibold text-blue-600">{withCtrBefore}</span>개</span>
          <span>측정 완료 <span className="font-semibold text-emerald-600">{measuredCount}</span>개</span>
          <span>추적 중 <span className="font-semibold text-cyan-600">{trackingCount}</span>개</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-[12px] font-semibold text-slate-500 w-[28%]">상품명</th>
              <th className="text-center px-2 py-3 text-[12px] font-semibold text-slate-500 w-12">등급</th>
              <th
                className="text-center px-2 py-3 text-[12px] font-semibold text-slate-500 cursor-pointer select-none hover:text-slate-700"
                onClick={() => toggleSort('appliedAt')}
              >
                <span className="flex items-center justify-center gap-1">적용일 <SortIcon k="appliedAt" /></span>
              </th>
              <th
                className="text-center px-2 py-3 text-[12px] font-semibold text-slate-500 cursor-pointer select-none hover:text-slate-700"
                onClick={() => toggleSort('daysElapsed')}
              >
                <span className="flex items-center justify-center gap-1">경과 <SortIcon k="daysElapsed" /></span>
              </th>
              <th
                className="text-center px-3 py-3 text-[12px] font-semibold text-blue-500 cursor-pointer select-none hover:text-blue-700"
                onClick={() => toggleSort('ctrBefore')}
              >
                <span className="flex items-center justify-center gap-1">기존 CTR <SortIcon k="ctrBefore" /></span>
              </th>
              <th className="text-center px-3 py-3 text-[12px] font-semibold text-slate-500">적용 후 CTR</th>
              <th
                className="text-center px-3 py-3 text-[12px] font-semibold text-slate-500 cursor-pointer select-none hover:text-slate-700"
                onClick={() => toggleSort('ctrChange')}
              >
                <span className="flex items-center justify-center gap-1">변화 <SortIcon k="ctrChange" /></span>
              </th>
              <th className="text-center px-2 py-3 text-[12px] font-semibold text-slate-500">상태</th>
              <th className="text-center px-3 py-3 text-[12px] font-semibold text-slate-500 w-16">성과 입력</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((record) => {
              const isEditing = editingId === record.id;
              const appliedDate = new Date(record.appliedAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });

              return (
                <Fragment key={record.id}>
                  <tr
                    className={cn(
                      'border-b border-slate-100 hover:bg-slate-50 transition-colors',
                      isEditing && 'bg-blue-50/30'
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-700 line-clamp-1" title={record.productName}>
                        {record.productName}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', GRADE_COLORS[record.originalGrade] ?? 'text-slate-500 bg-slate-100')}>
                        {record.originalGrade}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center text-[12px] text-slate-500">{appliedDate}</td>
                    <td className="px-2 py-3 text-center text-[12px] font-semibold text-slate-600">{record.daysElapsed}일</td>
                    <td className="px-3 py-3 text-center">
                      <CtrBadge value={record.ctrBefore} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CtrBadge value={record.ctrAfter} muted />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CtrChange value={record.ctrChange} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-full',
                        record.status === 'measured' ? 'text-emerald-700 bg-emerald-50' :
                        record.status === 'inconclusive' ? 'text-slate-500 bg-slate-100' :
                        'text-cyan-700 bg-cyan-50'
                      )}>
                        {STATUS_LABELS[record.status] ?? record.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => setEditingId(isEditing ? null : record.id)}
                        className={cn(
                          'text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors',
                          isEditing
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        )}
                      >
                        {isEditing ? '닫기' : '입력'}
                      </button>
                    </td>
                  </tr>
                  {isEditing && (
                    <tr>
                      <td colSpan={9} className="px-4 pb-3">
                        <MetricsForm record={record} onClose={() => setEditingId(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
