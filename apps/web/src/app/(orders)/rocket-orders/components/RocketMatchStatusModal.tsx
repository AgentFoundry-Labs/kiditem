'use client';

import { useEffect } from 'react';
import { ExternalLink, Package, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type {
  RocketPurchasePreviewComponent,
  RocketPurchasePreviewReason,
} from '@kiditem/shared/rocket-purchase-preview';

export interface RocketMatchStatusRow {
  poLineId: string;
  poNumber: string;
  productNo: string;
  productName: string;
  barcode: string;
  orderQuantity: number;
  reason: RocketPurchasePreviewReason | null;
  channelSkuId: string | null;
  components: RocketPurchasePreviewComponent[];
}

type MatchBucket = Exclude<RocketPurchasePreviewReason, 'insufficient_capacity'> | 'configured';

function bucketOfReason(reason: RocketPurchasePreviewReason | null): MatchBucket {
  switch (reason) {
    case 'mapping_required':
    case 'configuration_required':
    case 'review_required':
    case 'collection_incomplete':
    case 'vendor_mismatch':
      return reason;
    default:
      return 'configured';
  }
}

function bucketOf(row: RocketMatchStatusRow): MatchBucket {
  return bucketOfReason(row.reason);
}

const BUCKET_META: Record<MatchBucket, { label: string; chip: string; order: number; hint: string }> = {
  mapping_required: {
    label: '상품 연결 필요',
    chip: 'bg-red-50 text-red-500',
    order: 0,
    hint: '쿠팡 상품·옵션을 KidItem 운영 상품에 연결해야 합니다.',
  },
  configuration_required: {
    label: '재고 구성 필요',
    chip: 'bg-orange-50 text-orange-700',
    order: 1,
    hint: '연결된 운영 옵션에 Sellpia 재고 구성 레시피가 필요합니다.',
  },
  review_required: {
    label: '레시피 검토 필요',
    chip: 'bg-amber-50 text-amber-700',
    order: 2,
    hint: '제안된 Sellpia 구성 레시피를 운영자가 검토해야 합니다.',
  },
  collection_incomplete: {
    label: '수집 검증 필요',
    chip: 'bg-rose-50 text-rose-700',
    order: 0,
    hint: '쿠팡 PO 전체 수집이 완료되지 않아 상품 매칭을 평가하지 않았습니다.',
  },
  vendor_mismatch: {
    label: '공급사 검증 필요',
    chip: 'bg-rose-50 text-rose-700',
    order: 0,
    hint: '선택한 로켓 계정과 수집한 PO의 공급사 정보를 확인해야 합니다.',
  },
  configured: {
    label: '구성 완료',
    chip: 'bg-emerald-50 text-emerald-700',
    order: 3,
    hint: '채널 옵션과 Sellpia 구성 레시피가 확인되었습니다.',
  },
};

export function rocketProductMatchingHref({
  channelAccountId,
  productNo,
  channelSkuId,
}: Pick<RocketMatchStatusRow, 'productNo' | 'channelSkuId'> & { channelAccountId: string }) {
  const params = new URLSearchParams({ channelAccountId, search: productNo });
  if (channelSkuId) params.set('focusOptionId', channelSkuId);
  return `/product-hub/matching?${params.toString()}`;
}

export function rocketMatchStateLabel(reason: RocketPurchasePreviewReason | null): string {
  return BUCKET_META[bucketOfReason(reason)].label;
}

function componentValues(
  row: RocketMatchStatusRow,
): string {
  if (row.components.length === 0) return '—';
  return row.components.map((component) => formatNumber(component.currentStock)).join(' / ');
}

/**
 * 쿠팡 로켓 발주 상품이 셀피아 재고에 "어떻게" 매칭됐는지 한눈에 보는 현황 모달.
 * 미매칭 행을 먼저 정렬해 구성 레시피 검수가 필요한 항목을 보여준다.
 */
export function RocketMatchStatusModal({
  open,
  onClose,
  rows,
  date,
  channelAccountId,
  title = '매칭 현황',
}: {
  open: boolean;
  onClose: () => void;
  rows: RocketMatchStatusRow[];
  date: string | null;
  channelAccountId: string;
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
    {
      mapping_required: 0,
      configuration_required: 0,
      review_required: 0,
      collection_incomplete: 0,
      vendor_mismatch: 0,
      configured: 0,
    } as Record<MatchBucket, number>,
  );
  const needsReview = rows.length - counts.configured;
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
              {date ? `${date} · ` : '전체 · '}발주 상품 {formatNumber(rows.length)}행 · 상품·재고 구성 상태
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
          {([
            'collection_incomplete',
            'vendor_mismatch',
            'mapping_required',
            'configuration_required',
            'review_required',
            'configured',
          ] as MatchBucket[]).map((bucket) => (
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
                <th className="px-4 py-2 text-left font-semibold">상품·재고 상태</th>
                <th className="px-3 py-2 text-right font-semibold">발주</th>
                <th className="px-3 py-2 text-right font-semibold">현재고</th>
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', meta.chip)}
                          title={meta.hint}
                        >
                          {meta.label}
                        </span>
                        {bucket === 'mapping_required'
                          || bucket === 'configuration_required'
                          || bucket === 'review_required' ? (
                          <a
                            href={rocketProductMatchingHref({
                              channelAccountId,
                              productNo: row.productNo,
                              channelSkuId: row.channelSkuId,
                            })}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`${meta.label} 해결`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:underline"
                          >
                            상품 매칭 센터 <ExternalLink size={11} />
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatNumber(row.orderQuantity)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{componentValues(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
          <b className="text-slate-500">구성 완료</b>만 발주 수량을 검토할 수 있습니다. 나머지는 상품 매칭 센터에서 처리한 뒤 같은 미리보기를 다시 계산하세요.
        </div>
      </div>
    </div>
  );
}
