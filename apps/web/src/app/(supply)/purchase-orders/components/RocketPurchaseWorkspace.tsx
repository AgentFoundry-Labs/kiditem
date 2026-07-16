'use client';

import { useMemo, useState } from 'react';
import {
  ROCKET_PO_DETAIL_LIMIT,
  ROCKET_PO_LIST_PAGE_LIMIT,
} from '@kiditem/shared/rocket-purchase-preview';
import { collectRocketPoRowsFromExtension } from '@/lib/rocket-sales-collection';
import { friendlyError } from '@/lib/api-error';
import { previewRocketPurchases } from '../lib/rocket-purchase-preview-api';
import type {
  RocketPoCollectionEvidence,
  RocketPurchasePreviewReason,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';

const PREVIEW_REASON_LABELS: Record<RocketPurchasePreviewReason, string> = {
  mapping_required: '상품 매칭 필요',
  component_inactive: '비활성 Sellpia 구성품',
  insufficient_capacity: 'Sellpia 재고 부족',
  collection_incomplete: '수집 자료 불완전',
  vendor_mismatch: '채널 계정 불일치',
};

interface CollectionRunSummary {
  collection: RocketPoCollectionEvidence;
  poCount: number;
  rowCount: number;
  uniqueRowPoCount: number;
  rowsMatchEvidenceVendor: boolean;
}

function localCalendarDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeReviewQuantity(value: string, maxQuantity: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(maxQuantity, Math.max(0, Math.trunc(parsed)));
}

function collectionIsIncomplete(summary: CollectionRunSummary): boolean {
  const { collection } = summary;
  return collection.vendorId.length === 0
    || collection.truncated
    || collection.failedPoNumbers.length > 0
    || collection.listPagesRead >= ROCKET_PO_LIST_PAGE_LIMIT
    || collection.detailPoCount >= ROCKET_PO_DETAIL_LIMIT
    || collection.totalListPages > collection.listPagesRead
    || collection.detailPoCount !== summary.uniqueRowPoCount
    || !summary.rowsMatchEvidenceVendor;
}

function aggregateCollectionWarning(
  summary: CollectionRunSummary | null,
  preview: RocketPurchasePreviewResponse | null,
): string | null {
  if (!summary) return null;
  const previewReasons = new Set(preview?.rows.map(({ reason }) => reason) ?? []);
  if (collectionIsIncomplete(summary) || previewReasons.has('collection_incomplete')) {
    return '수집 범위가 불완전합니다. 누락된 PO를 확인한 뒤 다시 계산해 주세요. 공급사 식별 정보도 확인해 주세요.';
  }
  if (previewReasons.has('vendor_mismatch')) {
    return '선택한 로켓 채널 계정과 수집한 PO의 공급사가 일치하지 않습니다.';
  }
  if (preview && preview.rows.length === 0 && preview.catalog === null) {
    return '서버가 수집 결과를 차단했습니다. 수집 완전성과 선택한 채널 계정의 공급사를 확인해 주세요.';
  }
  return null;
}

export function RocketPurchaseWorkspace({
  channelAccountId,
}: {
  channelAccountId: string;
}) {
  const today = useMemo(() => localCalendarDay(new Date()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<RocketPurchasePreviewResponse | null>(null);
  const [collectionRun, setCollectionRun] = useState<CollectionRunSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recalculate = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setCollectionRun(null);
    try {
      const collected = await collectRocketPoRowsFromExtension({ from, to, status: 'RP' });
      setCollectionRun({
        collection: collected.collection,
        poCount: collected.poCount,
        rowCount: collected.rows.length,
        uniqueRowPoCount: new Set(collected.rows.map(({ poNumber }) => poNumber)).size,
        rowsMatchEvidenceVendor: collected.rows.every(
          ({ vendorId }) => vendorId === collected.collection.vendorId,
        ),
      });
      const retainedEdits = Object.fromEntries(collected.rows.flatMap((row) => {
        if (!Object.hasOwn(editedQuantities, row.poLineId)) return [];
        return [[row.poLineId, editedQuantities[row.poLineId]!]];
      }));
      const currentCapacity = await previewRocketPurchases({
        channelAccountId,
        collection: collected.collection,
        rows: collected.rows,
        editedQuantities: {},
      });
      const currentMaxByLine = new Map(currentCapacity.rows.map((row) =>
        [row.poLineId, row.maxQuantity]));
      const clampedEdits = Object.fromEntries(Object.entries(retainedEdits).flatMap(
        ([poLineId, editedQuantity]) => {
          const currentMax = currentMaxByLine.get(poLineId);
          return currentMax === undefined
            ? []
            : [[poLineId, Math.min(editedQuantity, currentMax)]];
        },
      ));
      const result = Object.keys(clampedEdits).length === 0
        ? currentCapacity
        : await previewRocketPurchases({
            channelAccountId,
            collection: collected.collection,
            rows: collected.rows,
            editedQuantities: clampedEdits,
            clampEditedQuantities: true,
          });
      setEditedQuantities(Object.fromEntries(result.rows.flatMap((row) =>
        row.editedQuantity === null
          ? []
          : [[row.poLineId, row.editedQuantity]],
      )));
      setPreview(result);
    } catch (cause) {
      setError(friendlyError(cause) ?? '로켓 발주 미리보기를 계산하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const collectionWarning = aggregateCollectionWarning(collectionRun, preview);

  return (
    <section aria-label="쿠팡 로켓 발주 미리보기" className="space-y-4">
      <div className="rounded-xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-[var(--text-secondary,#475569)]">
            <span>조회 시작일</span>
            <input
              aria-label="조회 시작일"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="block w-full rounded-lg border border-[var(--border,#cbd5e1)] px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--text-secondary,#475569)]">
            <span>조회 종료일</span>
            <input
              aria-label="조회 종료일"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="block w-full rounded-lg border border-[var(--border,#cbd5e1)] px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={loading || !channelAccountId}
            onClick={() => void recalculate()}
            className="rounded-lg bg-[var(--primary,#7048e8)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? '계산 중' : '미리보기 다시 계산'}
          </button>
          <button
            type="button"
            disabled
            className="rounded-lg border border-[var(--border,#cbd5e1)] px-4 py-2 text-sm font-semibold text-[var(--text-tertiary,#94a3b8)]"
          >
            로켓 발주 확정
          </button>
          <span className="text-sm font-semibold text-amber-700">
            0.1.19에서는 검토만 가능
          </span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {collectionRun ? (
        <div className="space-y-2 rounded-xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)] px-4 py-3 text-sm text-[var(--text-secondary,#475569)]">
          <p>
            목록 {collectionRun.collection.listPagesRead}/{collectionRun.collection.totalListPages}페이지
            {' · '}PO {collectionRun.poCount}건
            {' · '}상세 {collectionRun.collection.detailPoCount}/{collectionRun.poCount}건
            {' · '}품목 {collectionRun.rowCount}건
            {' · '}실패 PO {collectionRun.collection.failedPoNumbers.length}건
          </p>
          {collectionWarning ? (
            <p role="alert" className="font-semibold text-amber-700">
              {collectionWarning}
            </p>
          ) : null}
        </div>
      ) : null}

      {preview && preview.rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)] px-4 py-8 text-center">
          {collectionWarning ? (
            <>
              <p className="text-sm font-semibold text-amber-800">
                수집 결과가 차단되어 검토할 수 없습니다.
              </p>
              <p className="mt-1 text-xs text-amber-700">
                위 경고를 확인한 뒤 다시 수집해 주세요.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-[var(--text-primary,#0f172a)]">
                해당 기간에 검토할 로켓 PO가 없습니다.
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary,#94a3b8)]">
                조회 기간과 주문 상태를 바꾼 뒤 다시 계산해 보세요.
              </p>
            </>
          )}
        </div>
      ) : preview ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--surface-sunken,#f8fafc)] text-left text-[var(--text-secondary,#475569)]">
              <tr>
                <th className="px-3 py-2">PO</th>
                <th className="px-3 py-2">상품</th>
                <th className="px-3 py-2">발주수량</th>
                <th className="px-3 py-2">검토수량</th>
                <th className="px-3 py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.poLineId} className="border-t border-[var(--border,#e2e8f0)]">
                  <td className="px-3 py-2">{row.poNumber}</td>
                  <td className="px-3 py-2">{row.productName}</td>
                  <td className="px-3 py-2">{row.orderQuantity}</td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`${row.poNumber} 검토수량`}
                      type="number"
                      min={0}
                      max={row.maxQuantity}
                      step={1}
                      value={editedQuantities[row.poLineId] ?? row.recommendedQuantity}
                      onChange={(event) => setEditedQuantities((current) => ({
                        ...current,
                        [row.poLineId]: normalizeReviewQuantity(
                          event.target.value,
                          row.maxQuantity,
                        ),
                      }))}
                      className="w-24 rounded-md border border-[var(--border,#cbd5e1)] px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {row.reason ? PREVIEW_REASON_LABELS[row.reason] : '검토 가능'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
