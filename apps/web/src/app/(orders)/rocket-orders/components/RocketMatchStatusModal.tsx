'use client';

import { useEffect } from 'react';
import { Package, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { RocketComputedRow, RocketMatchKind } from '../lib/rocket-confirm-api';

type MatchBucket = RocketMatchKind | 'none';

/** 행 하나의 매칭 방식 판정. available 이 없으면 미매칭, matchKind 가 없으면 바코드(정확)로 본다. */
function bucketOf(row: RocketComputedRow): MatchBucket {
  if (row.available === null) return 'none';
  return row.matchKind ?? 'barcode';
}

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
    hint: '상품명 유사(퍼지) 매칭 — 오매칭 가능, 꼭 확인',
  },
  name: {
    label: '이름',
    chip: 'bg-sky-50 text-sky-600',
    order: 2,
    hint: '바코드가 아닌 상품명으로 매칭 — 확인 권장',
  },
  barcode: {
    label: '정확',
    chip: 'bg-slate-100 text-slate-500',
    order: 3,
    hint: '바코드 정확 매칭 — 신뢰',
  },
};

/**
 * 쿠팡 로켓 발주 상품이 셀피아 재고에 "어떻게" 매칭됐는지 한눈에 보는 현황 모달.
 * 위험한(미매칭 → 유사 → 이름) 순으로 정렬해 검수가 필요한 행을 먼저 보여준다.
 */
export function RocketMatchStatusModal({
  open,
  onClose,
  rows,
  date,
  title = '매칭 현황',
}: {
  open: boolean;
  onClose: () => void;
  rows: RocketComputedRow[];
  date: string | null;
  title?: string;
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
    { none: 0, 'name-fuzzy': 0, name: 0, barcode: 0 } as Record<MatchBucket, number>,
  );
  const needsReview = counts.none + counts['name-fuzzy'] + counts.name;
  const sorted = [...rows].sort((a, b) => BUCKET_META[bucketOf(a)].order - BUCKET_META[bucketOf(b)].order);

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
            <span key={bucket} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium', BUCKET_META[bucket].chip)}>
              {BUCKET_META[bucket].label}
              <b className="tabular-nums">{formatNumber(counts[bucket])}</b>
            </span>
          ))}
          <span className="ml-auto text-slate-500">
            검수 필요 <b className="tabular-nums text-amber-600">{formatNumber(needsReview)}</b>행
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
                  <tr key={`${row.poNumber}-${row.barcode}-${i}`} className="border-t border-slate-100 align-top">
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
                          <span className="truncate text-slate-600">{row.matchedName || '—'}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatNumber(row.orderQty)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.available === null ? (
                        <span className="text-red-400">—</span>
                      ) : (
                        <span className="text-slate-600">{formatNumber(row.available)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
          <b className="text-slate-500">정확</b>(바코드)은 신뢰, <b className="text-sky-600">이름</b>·<b className="text-amber-600">유사</b>는 상품명 기반이라 오매칭 가능 — 위쪽부터 확인하세요.
        </div>
      </div>
    </div>
  );
}
