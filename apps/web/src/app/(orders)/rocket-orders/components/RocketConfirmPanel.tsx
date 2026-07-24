'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  ListChecks,
  Loader2,
  Package,
  RefreshCw,
  Upload,
} from 'lucide-react';
import {
  isRocketWorkbookBlockingReason,
  ROCKET_SHORTAGE_REASONS,
  type RocketPurchasePreviewRow,
  type RocketShortageReason,
} from '@kiditem/shared/rocket-purchase-preview';
import { toast } from 'sonner';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { useRocketPurchaseWorkflow } from '@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow';
import { RocketDeterministicMatchingPanel } from '@/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel';
import type { RocketDecisionWorkspaceContext } from './RocketOrdersWorkspace';
import {
  RocketMatchStatusModal,
  rocketMatchStateLabel,
  rocketProductMatchingHref,
  type RocketMatchStatusRow,
} from './RocketMatchStatusModal';

function componentValues(
  row: RocketPurchasePreviewRow,
): string {
  if (row.components.length === 0) return '—';
  return row.components.map((component) => formatNumber(component.currentStock)).join(' / ');
}

function componentQuantityValues(
  row: RocketPurchasePreviewRow,
): string {
  if (row.components.length === 0) return '구성 —';
  return `구성 ${row.components
    .map((component) => `×${formatNumber(component.quantity)}`)
    .join(' / ')}`;
}

const WORKFLOW_LABEL = {
  awaiting_coupang_confirmation: '쿠팡 업로드·발주확정 대기',
  orders_collected: '주문수집 완료',
  sellpia_transmitting: 'Sellpia 반영 중',
  awaiting_inventory_sync: '재고 동기화 대기',
  completed: '재고 동기화 완료',
  failed: '재고 동기화 실패 — 다시 시도',
} as const;

function isRowReviewBlocked(reason: RocketPurchasePreviewRow['reason']): boolean {
  return isRocketWorkbookBlockingReason(reason)
    || reason === 'collection_incomplete'
    || reason === 'vendor_mismatch';
}

export function RocketConfirmPanel({
  onSaved,
  activeMonth,
  channelAccountId,
  hasConfiguredVendorId,
  from,
  to,
  selectedSourceImportRunId,
  onActivity,
  onOrdersChanged,
  renderOrderExplorer,
}: { onSaved: () => void } & RocketDecisionWorkspaceContext) {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDateSourceRunCount, setSelectedDateSourceRunCount] = useState(0);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [bulkShortageReason, setBulkShortageReason] = useState<RocketShortageReason | ''>('');
  const {
    editedQuantities,
    setReviewedQuantity,
    preview,
    sourceRows,
    previewDirty,
    setPreviewDirty,
    shortageReasons,
    setShortageReasons,
    workbookExport,
    exporting,
    abandonReason,
    setAbandonReason,
    abandoning,
    setTemplateFile,
    loading,
    error,
    collectionWarning,
    canExport,
    canRedownload,
    recalculate,
    revalidateEditedQuantities,
    exportAndDownload,
    downloadActiveWorkbook,
    refreshActiveWorkbook,
    abandonActiveWorkbook,
  } = useRocketPurchaseWorkflow({
    channelAccountId,
    hasConfiguredVendorId,
    from,
    to,
    savedSourceImportRunId: selectedSourceImportRunId,
    onCatalogSaved: onOrdersChanged,
    onActivity,
  });

  const sourceByLineId = useMemo(
    () => new Map(sourceRows.map((row) => [row.poLineId, row])),
    [sourceRows],
  );
  const rows = preview?.rows ?? [];
  const poCount = new Set(rows.map((row) => row.poNumber)).size;
  const previewDates = [...new Set(rows.map((row) => row.plannedDeliveryDate))].sort();
  const previewRangeLabel = previewDates.length === 0
    ? `${from} ~ ${to}`
    : previewDates.length === 1
      ? previewDates[0]!
      : `수집본 전체 ${previewDates[0]} ~ ${previewDates.at(-1)}`;
  const eligibleShortageLineIds = rows.flatMap((row) => {
    const quantity = editedQuantities[row.poLineId] ?? row.recommendedQuantity;
    return !isRowReviewBlocked(row.reason) && quantity < row.orderQuantity
      ? [row.poLineId]
      : [];
  });
  const confirmTotals = rows.reduce((acc, row) => {
    const quantity = editedQuantities[row.poLineId] ?? row.recommendedQuantity;
    const unitPrice = sourceByLineId.get(row.poLineId)?.confirmation?.purchasePrice ?? 0;
    return {
      qty: acc.qty + quantity,
      amount: acc.amount + unitPrice * quantity,
      short: acc.short + (quantity < row.orderQuantity ? 1 : 0),
    };
  }, { qty: 0, amount: 0, short: 0 });
  const matchRows: RocketMatchStatusRow[] = rows.map((row) => ({
    poLineId: row.poLineId,
    poNumber: row.poNumber,
    productNo: row.productNo,
    productName: row.productName,
    barcode: sourceByLineId.get(row.poLineId)?.barcode ?? '',
    orderQuantity: row.orderQuantity,
    reason: row.reason,
    channelSkuId: row.channelSkuId,
    components: row.components,
  }));
  const hasBlockingRows = rows.some((row) => isRocketWorkbookBlockingReason(row.reason));
  const busy = loading || exporting || abandoning;

  function handleExplorerDateSelection(date: string | null, sourceRunCount: number) {
    setSelectedDate(date ?? '');
    setSelectedDateSourceRunCount(sourceRunCount);
    setMatchModalOpen(false);
  }

  async function collectMonth() {
    if (!channelAccountId) {
      toast.error('활성 로켓 채널 계정이 필요합니다.');
      return;
    }
    await recalculate();
  }

  function applyBulkShortageReason() {
    if (!bulkShortageReason) return;
    if (eligibleShortageLineIds.length === 0) return;
    setShortageReasons((current) => ({
      ...current,
      ...Object.fromEntries(eligibleShortageLineIds.map((poLineId) => [
        poLineId,
        bulkShortageReason,
      ])),
    }));
    setPreviewDirty(true);
  }

  function editQuantity(row: RocketPurchasePreviewRow, quantity: number) {
    const bounded = Math.max(0, Math.min(row.orderQuantity, row.maxQuantity, quantity));
    setReviewedQuantity(row.poLineId, bounded);
    setShortageReasons((current) => {
      if (bounded >= row.orderQuantity) {
        const next = { ...current };
        delete next[row.poLineId];
        return next;
      }
      const next = { ...current };
      delete next[row.poLineId];
      return next;
    });
  }

  async function handleExport() {
    const result = await exportAndDownload();
    if (result) {
      toast.success(`쿠팡 엑셀 다운로드 — ${formatNumber(result.totals.workbookQuantity)}개`);
      onSaved();
      onOrdersChanged();
    }
  }

  async function handleAbandon() {
    await abandonActiveWorkbook();
    onOrdersChanged();
  }

  async function handleDownload() {
    const downloaded = await downloadActiveWorkbook();
    if (downloaded) {
      onSaved();
      toast.success('서버에 저장된 동일 엑셀을 다운로드했습니다.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-purple-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-purple-600" />
            <span className="text-sm font-semibold text-slate-900">거래확인요청 · 입고예정일 달력</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void collectMonth()}
              disabled={busy || !channelAccountId}
              title={`${activeMonth} 거래처확인요청 발주를 선택한 로켓 계정에서 수집합니다.`}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50',
                (busy || !channelAccountId) && 'pointer-events-none opacity-60',
              )}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {loading ? '수집·계산 중…' : '이 달 쿠팡에서 수집'}
            </button>
          </div>
        </div>

        <div className="p-4">
          {renderOrderExplorer({
            disabled: busy,
            onSelectDate: handleExplorerDateSelection,
          })}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>
              날짜 선택 → 발주 목록에서 수집본 선택 → 최신 Sellpia 재고로 미리보기
              {loading ? <Loader2 size={13} className="ml-1.5 inline animate-spin text-purple-500" /> : null}
            </span>
            <label className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50',
              busy && 'pointer-events-none opacity-60',
            )}>
              <Upload size={13} /> 쿠팡 양식 파일 선택
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setTemplateFile(file);
                  if (file) toast.success(`${file.name} 양식을 선택했습니다. 쿠팡 엑셀 생성에 사용합니다.`);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {selectedDate && selectedDateSourceRunCount === 0 && !loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
          선택한 날짜에 저장된 발주가 없습니다. 쿠팡에서 새로 수집해 주세요.
        </div>
      ) : null}

      {selectedDate && selectedDateSourceRunCount > 1 && !selectedSourceImportRunId && !loading ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          선택한 날짜에 사용할 수집본이 자동으로 정해지지 않았습니다. 아래 발주 목록을 펼쳐
          <b> 이 수집본으로 납품 판단</b>을 선택해 주세요.
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {collectionWarning ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          {collectionWarning}
        </div>
      ) : null}

      {workbookExport ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800">
          <span>
            {WORKFLOW_LABEL[workbookExport.status]} · 품목{' '}
            <b>{formatNumber(workbookExport.totals.lineCount)}</b>행 · 엑셀 수량{' '}
            <b>{formatNumber(workbookExport.totals.workbookQuantity)}</b>개
          </span>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!canRedownload || exporting}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1 font-semibold disabled:opacity-50"
          >
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            동일 파일 다시 다운로드
          </button>
          <button
            type="button"
            onClick={() => void refreshActiveWorkbook()}
            className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 font-semibold disabled:opacity-50"
          >
            상태 새로고침
          </button>
          {workbookExport.status === 'awaiting_coupang_confirmation' ? (
            <>
              <input
                aria-label="워크북 미사용 사유"
                value={abandonReason}
                onChange={(event) => setAbandonReason(event.target.value)}
                placeholder="쿠팡에 제출하지 않은 사유"
                maxLength={500}
                className="ml-auto min-w-56 rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={!workbookExport.canAbandon || !abandonReason.trim() || abandoning}
                onClick={() => void handleAbandon()}
                className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 font-semibold disabled:opacity-50"
              >
                {abandoning ? '종료 중…' : '워크북 사용 안 함'}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {preview?.catalog ? (
        <RocketDeterministicMatchingPanel
          channelAccountId={channelAccountId}
          latestAutomation={preview.catalog.recipeAutomation}
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <div className="text-sm font-semibold text-slate-900">
              미리보기 · 편집{' '}
              <span className="text-xs font-normal text-slate-400">
                {previewRangeLabel} · 발주 {poCount}건 · {rows.length}행
                {selectedSourceImportRunId ? ` · 수집본 ${selectedSourceImportRunId.slice(0, 8)}` : ''}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="전체 납품부족사유"
                  value={bulkShortageReason}
                  disabled={busy || eligibleShortageLineIds.length === 0}
                  onChange={(event) => setBulkShortageReason(
                    event.target.value as RocketShortageReason | '',
                  )}
                  className="max-w-[260px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:opacity-50"
                >
                  <option value="">전체 사유 선택</option>
                  {ROCKET_SHORTAGE_REASONS.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyBulkShortageReason}
                  disabled={busy || !bulkShortageReason || eligibleShortageLineIds.length === 0}
                  className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  부족 행 전체 적용
                </button>
              </div>
              <span className="text-xs text-slate-500">
                엑셀 <b className="tabular-nums text-slate-900">{formatNumber(confirmTotals.qty)}</b>개 · 부족{' '}
                <b className="tabular-nums text-amber-600">{confirmTotals.short}</b>행 · 금액{' '}
                <b className="tabular-nums text-purple-700">{formatKRW(confirmTotals.amount)}</b>원
              </span>
              {previewDirty ? (
                <button
                  type="button"
                  onClick={() => void revalidateEditedQuantities()}
                  disabled={busy}
                  className="rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-sm font-medium text-purple-700 disabled:opacity-50"
                >
                  수량 다시 검증
                </button>
              ) : null}
              {hasBlockingRows ? (
                <button
                  type="button"
                  onClick={() => void revalidateEditedQuantities()}
                  disabled={busy}
                  className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-800 disabled:opacity-50"
                >
                  매핑 반영해 다시 계산
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setMatchModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ListChecks size={14} /> 매칭 현황
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={!canExport || busy}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800',
                  (!canExport || busy) && 'pointer-events-none opacity-60',
                )}
              >
                {exporting && !canRedownload ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                쿠팡 엑셀 다운로드
              </button>
            </div>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-xs text-slate-500">
            Sellpia 원재고는 물리 재고입니다. 납품가능은 구성수량과 같은 수집본의 선행 발주 배정을
            반영한 해당 행의 최대 수량입니다.
          </div>

          <div className="max-h-[460px] overflow-auto">
            <table className="min-w-[980px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">발주번호</th>
                  <th className="px-3 py-2 text-left font-semibold">상품 (바코드)</th>
                  <th className="px-3 py-2 text-right font-semibold">발주</th>
                  <th className="px-3 py-2 text-right font-semibold">Sellpia 원재고</th>
                  <th className="px-3 py-2 text-right font-semibold">납품가능</th>
                  <th className="px-3 py-2 text-right font-semibold">엑셀 수량</th>
                  <th className="px-3 py-2 text-left font-semibold">납품부족사유</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const source = sourceByLineId.get(row.poLineId);
                  const quantity = editedQuantities[row.poLineId] ?? row.recommendedQuantity;
                  const short = quantity < row.orderQuantity;
                  const blocking = isRowReviewBlocked(row.reason);
                  const matchingBlocked = isRocketWorkbookBlockingReason(row.reason);
                  const matchStateLabel = rocketMatchStateLabel(row.reason);
                  return (
                    <tr key={row.poLineId} className={cn(
                      'border-t border-slate-100',
                      blocking ? 'bg-rose-50/40' : short && 'bg-amber-50/40',
                    )}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-slate-500">{row.poNumber}</td>
                      <td className="max-w-[260px] px-3 py-1.5">
                        <div className="truncate text-slate-700"><Package size={11} className="mr-1 inline text-purple-400" />{row.productName}</div>
                        <div className="font-mono text-[10px] text-slate-400">{source?.barcode || '—'}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            blocking ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700',
                          )}>
                            {matchStateLabel}
                          </span>
                          {matchingBlocked ? (
                            <a
                              href={rocketProductMatchingHref({
                                channelAccountId,
                                productNo: row.productNo,
                                channelSkuId: row.channelSkuId,
                              })}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`${matchStateLabel} 해결`}
                              className="text-[10px] font-semibold text-purple-700 hover:underline"
                            >
                              상품 매칭 센터
                            </a>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{formatNumber(row.orderQuantity)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                        <div>{componentValues(row)}</div>
                        <div className="text-[10px] text-slate-400">{componentQuantityValues(row)}</div>
                      </td>
                      <td
                        aria-label={`${row.poNumber} 납품가능 ${row.maxQuantity}개`}
                        className={cn(
                          'px-3 py-1.5 text-right font-semibold tabular-nums',
                          row.maxQuantity < row.orderQuantity ? 'text-amber-700' : 'text-slate-700',
                        )}
                      >
                        {formatNumber(row.maxQuantity)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          aria-label={`${row.poNumber} 엑셀 수량`}
                          type="number"
                          min={0}
                          max={Math.min(row.maxQuantity, row.orderQuantity)}
                          value={quantity}
                          disabled={blocking || Boolean(workbookExport && workbookExport.status !== 'completed')}
                          onChange={(event) => editQuantity(row, Number(event.target.value) || 0)}
                          className={cn(
                            'w-20 rounded-md border px-2 py-1 text-right text-sm tabular-nums',
                            short ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200',
                          )}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          aria-label={`${row.poNumber} 납품부족사유`}
                          value={shortageReasons[row.poLineId] ?? ''}
                          disabled={blocking || !short || Boolean(workbookExport && workbookExport.status !== 'completed')}
                          onChange={(event) => {
                            setShortageReasons((current) => ({
                              ...current,
                              [row.poLineId]: event.target.value as RocketShortageReason,
                            }));
                            setPreviewDirty(true);
                          }}
                          className={cn(
                            'w-full max-w-[280px] rounded-md border border-slate-200 px-2 py-1 text-xs',
                            !short && 'bg-slate-50 text-slate-300',
                          )}
                        >
                          <option value="">{short ? '사유 선택' : '—'}</option>
                          {ROCKET_SHORTAGE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {preview && rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
          검토할 로켓 발주가 없습니다.
        </div>
      ) : null}

      <RocketMatchStatusModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        rows={matchRows}
        date={selectedDate || null}
        channelAccountId={channelAccountId}
      />
    </div>
  );
}
