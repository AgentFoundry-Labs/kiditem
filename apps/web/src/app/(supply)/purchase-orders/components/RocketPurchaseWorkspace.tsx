'use client';

import { useMemo, useState } from 'react';
import type { RocketPurchasePreviewResponse } from '@kiditem/shared/rocket-purchase-preview';
import { collectRocketPoRowsFromExtension } from '@/lib/rocket-sales-collection';
import { friendlyError } from '@/lib/api-error';
import { previewRocketPurchases } from '../lib/rocket-purchase-preview-api';

export function RocketPurchaseWorkspace({
  channelAccountId,
}: {
  channelAccountId: string;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<RocketPurchasePreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recalculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const collected = await collectRocketPoRowsFromExtension({ from, to, status: 'RP' });
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
          });
      const latestMaxByLine = new Map(result.rows.map((row) =>
        [row.poLineId, row.maxQuantity]));
      setEditedQuantities(Object.fromEntries(Object.entries(clampedEdits).flatMap(
        ([poLineId, editedQuantity]) => {
          const latestMax = latestMaxByLine.get(poLineId);
          return latestMax === undefined
            ? []
            : [[poLineId, Math.min(editedQuantity, latestMax)]];
        },
      )));
      setPreview(result);
    } catch (cause) {
      setError(friendlyError(cause) ?? '로켓 발주 미리보기를 계산하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

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

      {preview ? (
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
                      value={editedQuantities[row.poLineId] ?? row.recommendedQuantity}
                      onChange={(event) => setEditedQuantities((current) => ({
                        ...current,
                        [row.poLineId]: Math.max(0, Number(event.target.value) || 0),
                      }))}
                      className="w-24 rounded-md border border-[var(--border,#cbd5e1)] px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">{row.reason ?? '검토 가능'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
