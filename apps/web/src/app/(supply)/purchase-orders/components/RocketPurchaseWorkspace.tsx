'use client';

import { ROCKET_SHORTAGE_REASONS } from '@kiditem/shared/rocket-purchase-preview';
import { useRocketPurchaseWorkflow } from '../hooks/useRocketPurchaseWorkflow';
import { RocketDeterministicMatchingPanel } from './RocketDeterministicMatchingPanel';
import type { RocketOrderActivityInput } from '@/lib/rocket-order-activity';
import type {
  RocketPurchasePreviewReason,
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

function previewReasonLabel(
  reason: RocketPurchasePreviewReason,
  hasConfiguredVendorId: boolean,
): string {
  if (reason === 'vendor_mismatch' && !hasConfiguredVendorId) {
    return '공급사 ID 설정 필요';
  }
  return PREVIEW_REASON_LABELS[reason];
}

function normalizeReviewQuantity(value: string, maxQuantity: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(maxQuantity, Math.max(0, Math.trunc(parsed)));
}

export function RocketPurchaseWorkspace({
  channelAccountId,
  hasConfiguredVendorId = true,
  from,
  to,
  savedSourceImportRunId = null,
  onCatalogSaved,
  onActivity,
}: {
  channelAccountId: string;
  hasConfiguredVendorId?: boolean;
  /** 입고예정일 조회 범위. 로켓 발주 캘린더(RocketOrdersWorkspace)가 단일 소스다. */
  from: string;
  to: string;
  savedSourceImportRunId?: string | null;
  onCatalogSaved?: () => void;
  onActivity?: (activity: RocketOrderActivityInput) => void;
}) {
  const {
    editedQuantities,
    setEditedQuantities,
    preview,
    previewDirty,
    setPreviewDirty,
    collectionRun,
    shortageReasons,
    setShortageReasons,
    confirmation,
    confirming,
    releaseReason,
    setReleaseReason,
    releasing,
    loading,
    error,
    collectionWarning,
    canConfirm,
    canRedownload,
    recalculate,
    revalidateEditedQuantities,
    confirmAndDownload,
    releaseConfirmation,
  } = useRocketPurchaseWorkflow({
    channelAccountId,
    hasConfiguredVendorId,
    from,
    to,
    savedSourceImportRunId,
    onCatalogSaved,
    onActivity,
  });

  return (
    <section aria-label="쿠팡 로켓 발주 미리보기" className="space-y-4">
      <div className="rounded-xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)] p-4">
        {/* 조회 범위는 위 로켓 발주 캘린더(입고예정일)를 그대로 따른다 — 날짜 입력을 이중으로 두지 않는다. */}
        <div className="text-sm text-[var(--text-secondary,#475569)]">
          입고예정일{' '}
          <span className="font-semibold tabular-nums text-[var(--text,#0f172a)]">
            {from} ~ {to}
          </span>{' '}
          <span className="text-[var(--text-tertiary,#94a3b8)]">(위 캘린더 기준)</span>
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

      {preview?.catalog ? (
        <RocketDeterministicMatchingPanel
          channelAccountId={channelAccountId}
          onApplied={revalidateEditedQuantities}
        />
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
              <col className="w-[18%]" />
              <col className="w-[9%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
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
                    {row.reason
                      ? previewReasonLabel(row.reason, hasConfiguredVendorId)
                      : '검토 가능'}
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
