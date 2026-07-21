'use client';

import { useEffect } from 'react';
import { Package, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';

export interface RocketMatchStatusRow {
  poLineId: string;
  poNumber: string;
  productName: string;
  barcode: string;
  orderQuantity: number;
  availableStock: number | null;
  mapped: boolean;
  /**
   * 매칭 방식: barcode(정확) · name(이름일치) · name-fuzzy(유사, 확인필요) · null(미매칭).
   * 없으면(구버전 데이터) mapped 여부만으로 바코드/미매칭 폴백.
   */
  matchType?: 'barcode' | 'name' | 'name-fuzzy' | null;
  /** 매칭된 셀피아 상품명(있으면 표시). 없으면 레시피 확인 문구로 폴백. */
  sellpiaName?: string | null;
}

type MatchBucket = 'barcode' | 'name' | 'name-fuzzy' | 'none';

function bucketOf(row: RocketMatchStatusRow): MatchBucket {
  if (!row.mapped) return 'none';
  return row.matchType ?? 'barcode';
}

/** order 가 높을수록 신뢰도 높음(바코드 > 이름 > 유사 > 미매칭). */
const BUCKET_META: Record<MatchBucket, { label: string; chip: string; order: number; hint: string }> = {
  none: {
    label: '미매칭',
    chip: 'bg-red-50 text-red-500',
    order: 0,
    hint: '셀피아 재고에서 못 찾음 — 매핑 필요',
  },
  'name-fuzzy': {
    label: '유사',
    chip: 'bg-amber-50 text-amber-600',
    order: 1,
    hint: '이름이 유사한 셀피아 상품에 매칭 — 다른 상품일 수 있어 확인 필요(참고용)',
  },
  name: {
    label: '이름',
    chip: 'bg-sky-50 text-sky-600',
    order: 2,
    hint: '이름이 일치하는 셀피아 상품에 매칭(바코드 없음)',
  },
  barcode: {
    label: '바코드',
    chip: 'bg-emerald-50 text-emerald-600',
    order: 3,
    hint: '바코드로 셀피아 재고와 정확히 매칭됨',
  },
};

/** 검수가 필요한(불확실) 버킷 — 미매칭 + 유사(name-fuzzy). */
const REVIEW_BUCKETS: MatchBucket[] = ['none', 'name-fuzzy'];

/**
 * 쿠팡 로켓 발주 상품이 셀피아 재고에 "어떻게" 매칭됐는지 한눈에 보는 현황 모달.
 * 미매칭 행을 먼저 정렬해 구성 레시피 검수가 필요한 항목을 보여준다.
 */
export function RocketMatchStatusModal({
  open,
  onClose,
  rows,
  date,
  title = '매칭 현황',
  matchedFirst = false,
}: {
  open: boolean;
  onClose: () => void;
  rows: RocketMatchStatusRow[];
  date: string | null;
  title?: string;
  /** true 면 매칭된 행을 위로(바코드 매칭 뷰). 기본은 미매칭 우선(레시피 검수). */
  matchedFirst?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const counts = rows.reduce(
    (acc, row) => {
      acc[bucketOf(row)] += 1;
      return acc;
    },
    { barcode: 0, name: 0, 'name-fuzzy': 0, none: 0 } as Record<MatchBucket, number>,
  );
  const needsReview = REVIEW_BUCKETS.reduce((sum, bucket) => sum + counts[bucket], 0);
  const sorted = [...rows].sort((a, b) => {
    const diff = BUCKET_META[bucketOf(a)].order - BUCKET_META[bucketOf(b)].order;
    return matchedFirst ? -diff : diff;
  });

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="쿠팡 로켓 상품 매칭 현황"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Package size={17} className="text-purple-600" /> {title}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {date ? `${date} · ` : '전체 · '}발주 상품 {formatNumber(rows.length)}행 · 셀피아 재고 매칭 방식
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 text-xs">
          {(['barcode', 'name', 'name-fuzzy', 'none'] as MatchBucket[]).map((bucket) => (
            <span
              key={bucket}
              title={BUCKET_META[bucket].hint}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium', BUCKET_META[bucket].chip)}
            >
              {BUCKET_META[bucket].label}
              <b className="tabular-nums">{formatNumber(counts[bucket])}</b>
            </span>
          ))}
          <span className="ml-auto text-slate-500">
            확인 필요 <b className="tabular-nums text-amber-600">{formatNumber(needsReview)}</b>행
            <span className="ml-1 text-slate-400">(유사·미매칭)</span>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">발주 상품 · 쿠팡 (바코드)</th>
                <th className="px-4 py-2 text-left font-semibold">셀피아 상품 · 매칭</th>
                <th className="px-3 py-2 text-right font-semibold">발주</th>
                <th className="px-4 py-2 text-right font-semibold">재고</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const bucket = bucketOf(row);
                const meta = BUCKET_META[bucket];
                return (
                  <tr key={row.poLineId || `${row.poNumber}-${row.barcode}-${i}`} className="border-t border-slate-100 align-top">
                    <td className="max-w-[320px] px-4 py-2">
                      <div className="truncate text-slate-700">{row.productName || '—'}</div>
                      <div className="font-mono text-[10px] text-slate-400">{row.barcode || '—'}</div>
                    </td>
                    <td className="max-w-[320px] px-4 py-2">
                      {bucket === 'none' ? (
                        <span className="text-xs text-red-400">셀피아 재고에서 못 찾음</span>
                      ) : (
                        <div className="flex items-start gap-1.5">
                          <span
                            className={cn('mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', meta.chip)}
                            title={meta.hint}
                          >
                            {meta.label}
                          </span>
                          <span className="truncate text-slate-600">
                            {row.sellpiaName || 'Sellpia 구성 레시피 확인'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatNumber(row.orderQuantity)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.availableStock === null ? (
                        <span className="text-red-400">—</span>
                      ) : (
                        <span className="text-slate-600">{formatNumber(row.availableStock)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
          <b className="text-emerald-600">바코드</b> 정확 매칭 · <b className="text-sky-600">이름</b> 상품명 일치 ·{' '}
          <b className="text-amber-600">유사</b> 이름만 비슷(다른 상품일 수 있어 참고용) · <b className="text-red-500">미매칭</b> 셀피아에 없음.{' '}
          셀피아 전송은 <b className="text-slate-500">바코드</b> 기준이라 유사/이름 매칭은 재고 참고용입니다.
        </div>
      </div>
    </div>
  );
}
