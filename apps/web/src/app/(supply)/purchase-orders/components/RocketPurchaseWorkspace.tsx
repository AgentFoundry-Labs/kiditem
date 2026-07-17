'use client';

import { useMemo, useState } from 'react';
import {
  ROCKET_SHORTAGE_REASONS,
  ROCKET_PO_DETAIL_LIMIT,
  ROCKET_PO_LIST_PAGE_LIMIT,
} from '@kiditem/shared/rocket-purchase-preview';
import { collectRocketPoRowsForConfirmationFromExtension } from '@/lib/rocket-sales-collection';
import { friendlyError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import { saveRocketConfirmFile } from '@/lib/rocket-confirm-file-store';
import {
  confirmRocketPurchase,
  previewRocketPurchases,
  releaseRocketPurchaseConfirmation,
} from '../lib/rocket-purchase-preview-api';
import { buildRocketConfirmationWorkbook } from '../lib/rocket-confirmation-workbook';
import type {
  RocketPoCatalogRow,
  RocketPoCollectionEvidence,
  RocketPurchaseConfirmationResponse,
  RocketPurchasePreviewReason,
  RocketPurchasePreviewResponse,
  RocketShortageReason,
} from '@kiditem/shared/rocket-purchase-preview';

const PREVIEW_REASON_LABELS: Record<RocketPurchasePreviewReason, string> = {
  mapping_required: '상품 매칭 필요',
  configuration_required: '구성 필요',
  review_required: '검토 필요',
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

function editFingerprint(quantities: Record<string, number>): string {
  return JSON.stringify(Object.entries(quantities).sort(([left], [right]) =>
    left.localeCompare(right)));
}

function collectionIsIncomplete(summary: CollectionRunSummary): boolean {
  const { collection } = summary;
  const requiresVendorEvidence = summary.poCount > 0 || summary.rowCount > 0;
  return (requiresVendorEvidence && collection.vendorId.length === 0)
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
  const [previewDirty, setPreviewDirty] = useState(false);
  const [validatedEditFingerprint, setValidatedEditFingerprint] = useState('');
  const [sourceRows, setSourceRows] = useState<RocketPoCatalogRow[]>([]);
  const [collectionRun, setCollectionRun] = useState<CollectionRunSummary | null>(null);
  const [shortageReasons, setShortageReasons] = useState<Record<string, RocketShortageReason>>({});
  const [confirmationKey, setConfirmationKey] = useState('');
  const [confirmation, setConfirmation] = useState<RocketPurchaseConfirmationResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recalculate = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setSourceRows([]);
    setCollectionRun(null);
    setConfirmation(null);
    setConfirmationKey('');
    setShortageReasons({});
    setReleaseReason('');
    try {
      const collected = await collectRocketPoRowsForConfirmationFromExtension({ from, to });
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
      const result = await previewRocketPurchases({
        channelAccountId,
        collection: collected.collection,
        rows: collected.rows,
        editedQuantities: retainedEdits,
        clampEditedQuantities: true,
      });
      const effectiveEdits = Object.fromEntries(result.rows.map((row) => [
        row.poLineId,
        row.editedQuantity ?? row.recommendedQuantity,
      ]));
      setEditedQuantities(effectiveEdits);
      setValidatedEditFingerprint(editFingerprint(effectiveEdits));
      setPreviewDirty(false);
      setSourceRows(collected.rows);
      setConfirmationKey(globalThis.crypto.randomUUID());
      setShortageReasons({});
      setPreview(result);
    } catch (cause) {
      setError(friendlyError(cause) ?? '로켓 발주 미리보기를 계산하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const revalidateEditedQuantities = async () => {
    if (!collectionRun || sourceRows.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await previewRocketPurchases({
        channelAccountId,
        collection: collectionRun.collection,
        rows: sourceRows,
        editedQuantities,
        clampEditedQuantities: true,
      });
      const effectiveEdits = Object.fromEntries(result.rows.map((row) => [
        row.poLineId,
        row.editedQuantity ?? row.recommendedQuantity,
      ]));
      setPreview(result);
      setEditedQuantities(effectiveEdits);
      setValidatedEditFingerprint(editFingerprint(effectiveEdits));
      setPreviewDirty(false);
    } catch (cause) {
      setPreviewDirty(true);
      setError(friendlyError(cause) ?? '수량을 다시 검증하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const collectionWarning = aggregateCollectionWarning(collectionRun, preview);
  const reviewedQuantities = preview
    ? Object.fromEntries(preview.rows.map((row) => [
        row.poLineId,
        editedQuantities[row.poLineId] ?? row.recommendedQuantity,
      ]))
    : {};
  const canConfirm = Boolean(
    preview?.catalog
    && preview.rows.length > 0
    && sourceRows.length === preview.rows.length
    && sourceRows.every((row) => row.confirmation && row.barcode.length > 0)
    && !previewDirty
    && validatedEditFingerprint === editFingerprint(reviewedQuantities)
    && preview.rows.every((row) => (
      (reviewedQuantities[row.poLineId] ?? 0) >= row.orderQuantity
      || Boolean(shortageReasons[row.poLineId])
    ))
    && !collectionWarning
    && confirmationKey
    && confirmation === null,
  );
  const canRedownload = confirmation?.status === 'active';

  const downloadConfirmationWorkbook = async (
    result: RocketPurchaseConfirmationResponse,
  ): Promise<void> => {
    const workbook = buildRocketConfirmationWorkbook({
      sourceRows,
      confirmedRows: result.rows,
    });
    downloadBlob(workbook.blob, workbook.fileName);
    try {
      await saveRocketConfirmFile({
        id: `rocket-confirmation-${result.confirmationId}`,
        fileName: workbook.fileName,
        createdAt: Date.now(),
        blob: workbook.blob,
        totalRows: workbook.summary.totalRows,
        fullyConfirmed: workbook.summary.fullyConfirmedRows,
        shortRows: workbook.summary.shortRows,
      });
    } catch {
      setError('엑셀은 다운로드됐지만 로컬 파일 이력에 저장하지 못했습니다.');
    }
  };

  const confirmAndDownload = async () => {
    if (canRedownload) {
      setConfirming(true);
      setError(null);
      try {
        await downloadConfirmationWorkbook(confirmation);
      } catch {
        setError(
          '확정은 완료됐지만 엑셀 생성에 실패했습니다. 다시 다운로드하거나 확정을 해제해 주세요.',
        );
      } finally {
        setConfirming(false);
      }
      return;
    }
    if (!preview || !collectionRun || !canConfirm) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await confirmRocketPurchase({
        idempotencyKey: confirmationKey,
        channelAccountId,
        collection: collectionRun.collection,
        rows: sourceRows,
        editedQuantities: reviewedQuantities,
        shortageReasons,
      });
      setConfirmation(result);
      try {
        await downloadConfirmationWorkbook(result);
      } catch {
        setError(
          '확정은 완료됐지만 엑셀 생성에 실패했습니다. 다시 다운로드하거나 확정을 해제해 주세요.',
        );
      }
    } catch (cause) {
      setError(friendlyError(cause) ?? '로켓 발주를 확정하지 못했습니다.');
    } finally {
      setConfirming(false);
    }
  };

  const releaseConfirmation = async () => {
    if (confirmation?.status !== 'active' || !releaseReason.trim()) return;
    setReleasing(true);
    setError(null);
    try {
      setConfirmation(await releaseRocketPurchaseConfirmation({
        confirmationId: confirmation.confirmationId,
        reason: releaseReason.trim(),
      }));
    } catch (cause) {
      setError(friendlyError(cause) ?? '로켓 발주 예약을 종료하지 못했습니다.');
    } finally {
      setReleasing(false);
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
          {preview?.rows.length ? (
            <button
              type="button"
              disabled={!previewDirty || loading || confirming}
              onClick={() => void revalidateEditedQuantities()}
              className="whitespace-nowrap rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-40"
            >
              {loading && previewDirty ? '검증 중' : '수량 다시 검증'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={(!canConfirm && !canRedownload) || confirming || loading}
            onClick={() => void confirmAndDownload()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {confirming
              ? canRedownload ? '엑셀 생성 중' : '확정 중'
              : canRedownload ? '엑셀 다시 다운로드' : '확정 후 엑셀 다운로드'}
          </button>
          <span className="text-sm font-semibold text-[var(--text-secondary,#475569)]">
            {confirmation?.status === 'active'
              ? `확정 완료 · 구성품 ${confirmation.totals.allocatedQuantity}개 예약 (실재고 반영 또는 취소 후 예약 종료)`
              : confirmation?.status === 'released'
                ? '예약 종료됨 · 다시 계산해 주세요.'
                : previewDirty
                  ? '수량이 변경되었습니다. 전체 수량을 다시 검증해 주세요.'
                  : canConfirm
                  ? '확정 시 구성품 재고를 예약하고 엑셀을 생성합니다.'
                  : '미리보기 검토 후 확정할 수 있습니다.'}
          </span>
        </div>
        {confirmation?.status === 'active' ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border,#e2e8f0)] pt-3">
            <input
              aria-label="예약 종료 사유"
              value={releaseReason}
              onChange={(event) => setReleaseReason(event.target.value)}
              placeholder="실재고 반영 또는 취소 등 예약 종료 사유"
              maxLength={500}
              className="min-w-64 flex-1 rounded-lg border border-[var(--border,#cbd5e1)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!releaseReason.trim() || releasing}
              onClick={() => void releaseConfirmation()}
              className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
            >
              {releasing ? '종료 중' : '예약 종료'}
            </button>
          </div>
        ) : null}
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
                거래확인서요청 상태만 검토합니다. 조회 기간을 바꾼 뒤 다시 계산해 보세요.
              </p>
            </>
          )}
        </div>
      ) : preview ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)]">
          <p className="border-b border-[var(--border,#e2e8f0)] bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
            공유 재고는 빠른 납품예정일 → PO 번호 → 라인 순서로 배분됩니다.
          </p>
          <table className="w-full min-w-[1480px] table-fixed text-sm">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[20%]" />
              <col className="w-[9%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[17%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className="bg-[var(--surface-sunken,#f8fafc)] text-left text-[var(--text-secondary,#475569)]">
              <tr>
                <th className="px-3 py-2">PO</th>
                <th className="px-3 py-2">상품</th>
                <th className="px-3 py-2">납품예정일</th>
                <th className="px-3 py-2 text-right">현재고</th>
                <th className="px-3 py-2 text-right">약정</th>
                <th className="px-3 py-2 text-right">가용재고</th>
                <th className="px-3 py-2">발주수량</th>
                <th className="px-3 py-2">검토수량</th>
                <th className="px-3 py-2">납품부족사유</th>
                <th className="px-3 py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.poLineId} className="border-t border-[var(--border,#e2e8f0)]">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row.poNumber}</td>
                  <td className="overflow-hidden px-3 py-2"><span className="block truncate" title={row.productName}>{row.productName}</span></td>
                  <td className="whitespace-nowrap px-3 py-2">{row.plannedDeliveryDate}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{row.components.length ? row.components.map((component) => component.currentStock).join(' / ') : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{row.components.length ? row.components.map((component) => component.activeCommitmentQuantity).join(' / ') : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{row.components.length ? row.components.map((component) => component.availableStock).join(' / ') : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.orderQuantity}</td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`${row.poNumber} 검토수량`}
                      type="number"
                      min={0}
                      max={Math.min(row.maxQuantity, row.orderQuantity)}
                      step={1}
                      value={editedQuantities[row.poLineId] ?? row.recommendedQuantity}
                      onChange={(event) => {
                        const quantity = normalizeReviewQuantity(
                          event.target.value,
                          Math.min(row.maxQuantity, row.orderQuantity),
                        );
                        setEditedQuantities((current) => ({
                          ...current,
                          [row.poLineId]: quantity,
                        }));
                        setPreviewDirty(true);
                        setShortageReasons((current) => {
                          if (quantity >= row.orderQuantity) {
                            const { [row.poLineId]: _removed, ...rest } = current;
                            return rest;
                          }
                          return current;
                        });
                      }}
                      className="w-24 rounded-md border border-[var(--border,#cbd5e1)] px-2 py-1"
                    />
                  </td>
                  <td className="overflow-hidden px-3 py-2">
                    <select
                      aria-label={`${row.poNumber} 납품부족사유`}
                      value={shortageReasons[row.poLineId] ?? ''}
                      disabled={(editedQuantities[row.poLineId] ?? row.recommendedQuantity) >= row.orderQuantity}
                      onChange={(event) => {
                        const reason = event.target.value;
                        setShortageReasons((current) => {
                          if (reason.length === 0) {
                            const { [row.poLineId]: _removed, ...rest } = current;
                            return rest;
                          }
                          return {
                            ...current,
                            [row.poLineId]: reason as RocketShortageReason,
                          };
                        });
                      }}
                      className="w-full rounded-md border border-[var(--border,#cbd5e1)] px-2 py-1 text-xs disabled:bg-slate-100"
                    >
                      <option value="">사유 없음</option>
                      {ROCKET_SHORTAGE_REASONS.map((reason) => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                    </select>
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
