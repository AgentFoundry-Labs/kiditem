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
  ROCKET_SHORTAGE_REASONS,
  type RocketPurchasePreviewRow,
  type RocketShortageReason,
} from '@kiditem/shared/rocket-purchase-preview';
import { toast } from 'sonner';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { useRocketPurchaseWorkflow } from '@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow';
import { RocketInventoryCommitmentList } from '@/app/(supply)/purchase-orders/components/RocketInventoryCommitmentList';
import type { RocketDecisionWorkspaceContext } from './RocketOrdersWorkspace';
import {
  RocketMatchStatusModal,
  type RocketMatchStatusRow,
} from './RocketMatchStatusModal';

function rowAvailableStock(row: RocketPurchasePreviewRow): number | null {
  if (row.components.length === 0) return null;
  return row.maxQuantity;
}

function componentValues(
  row: RocketPurchasePreviewRow,
  field: 'currentStock' | 'activeCommitmentQuantity' | 'availableStock',
): string {
  if (row.components.length === 0) return '—';
  return row.components.map((component) => formatNumber(component[field])).join(' / ');
}

export function RocketConfirmPanel({
  onSaved,
  activeMonth,
  channelAccountId,
  channelAccountName,
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
  const [commitmentRefreshKey, setCommitmentRefreshKey] = useState(0);
  const {
    editedQuantities,
    setEditedQuantities,
    preview,
    sourceRows,
    previewDirty,
    setPreviewDirty,
    shortageReasons,
    setShortageReasons,
    confirmation,
    confirming,
    releaseReason,
    setReleaseReason,
    releasing,
    setTemplateFile,
    loading,
    error,
    collectionWarning,
    canConfirm,
    canRedownload,
    recalculate,
    revalidateEditedQuantities,
    confirmPurchase,
    downloadActiveConfirmation,
    releaseConfirmation,
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
    productName: row.productName,
    barcode: sourceByLineId.get(row.poLineId)?.barcode ?? '',
    orderQuantity: row.orderQuantity,
    availableStock: rowAvailableStock(row),
    mapped: row.productVariantId !== null && row.components.length > 0,
  }));
  const busy = loading || confirming || releasing;

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
    onOrdersChanged();
  }

  function editQuantity(row: RocketPurchasePreviewRow, quantity: number) {
    const bounded = Math.max(0, Math.min(row.orderQuantity, row.maxQuantity, quantity));
    setEditedQuantities((current) => ({ ...current, [row.poLineId]: bounded }));
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
    setPreviewDirty(true);
  }

  async function handleCommit() {
    const result = await confirmPurchase();
    if (result) {
      toast.success(`예약 확정 — ${formatNumber(result.totals.confirmedQuantity)}개`);
      setCommitmentRefreshKey((current) => current + 1);
      onOrdersChanged();
    }
  }

  async function handleRelease() {
    await releaseConfirmation();
    setCommitmentRefreshKey((current) => current + 1);
  }

  async function handleDownload() {
    const downloaded = await downloadActiveConfirmation();
    if (downloaded) {
      onSaved();
      toast.success('확정된 수량으로 엑셀을 다운로드했습니다.');
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
              <Upload size={13} /> 쿠팡 양식 채우기
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setTemplateFile(file);
                  if (file) toast.success(`${file.name} 양식을 선택했습니다. 확정 후 다운로드에 사용합니다.`);
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

      {confirmation?.status === 'active' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800">
          <span>
            예약 확정 · 품목 <b>{formatNumber(confirmation.totals.lineCount)}</b>행 · 구성품{' '}
            <b>{formatNumber(confirmation.totals.allocatedQuantity)}</b>개
          </span>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!canRedownload || confirming}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1 font-semibold disabled:opacity-50"
          >
            {confirming ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            확정 엑셀 다운로드
          </button>
          <input
            aria-label="예약 종료 사유"
            value={releaseReason}
            onChange={(event) => setReleaseReason(event.target.value)}
            placeholder="취소 등 예약 종료 사유"
            maxLength={500}
            className="ml-auto min-w-56 rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={!releaseReason.trim() || releasing}
            onClick={() => void handleRelease()}
            className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 font-semibold disabled:opacity-50"
          >
            {releasing ? '종료 중…' : '예약 종료'}
          </button>
        </div>
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
              <span className="text-xs text-slate-500">
                확정 <b className="tabular-nums text-slate-900">{formatNumber(confirmTotals.qty)}</b>개 · 부족{' '}
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
              <button
                type="button"
                onClick={() => setMatchModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ListChecks size={14} /> 매칭 현황
              </button>
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={!canConfirm || busy}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800',
                  (!canConfirm || busy) && 'pointer-events-none opacity-60',
                )}
              >
                {confirming && !canRedownload ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                예약 확정
              </button>
            </div>
          </div>

          <div className="max-h-[460px] overflow-auto">
            <table className="min-w-[1080px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">발주번호</th>
                  <th className="px-3 py-2 text-left font-semibold">상품 (바코드)</th>
                  <th className="px-3 py-2 text-right font-semibold">발주</th>
                  <th className="px-3 py-2 text-right font-semibold">현재고</th>
                  <th className="px-3 py-2 text-right font-semibold">약정</th>
                  <th className="px-3 py-2 text-right font-semibold">가용재고</th>
                  <th className="px-3 py-2 text-right font-semibold">확정수량</th>
                  <th className="px-3 py-2 text-left font-semibold">납품부족사유</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const source = sourceByLineId.get(row.poLineId);
                  const quantity = editedQuantities[row.poLineId] ?? row.recommendedQuantity;
                  const short = quantity < row.orderQuantity;
                  return (
                    <tr key={row.poLineId} className={cn('border-t border-slate-100', short && 'bg-amber-50/40')}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-slate-500">{row.poNumber}</td>
                      <td className="max-w-[260px] px-3 py-1.5">
                        <div className="truncate text-slate-700"><Package size={11} className="mr-1 inline text-purple-400" />{row.productName}</div>
                        <div className="font-mono text-[10px] text-slate-400">{source?.barcode || '—'}</div>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{formatNumber(row.orderQuantity)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{componentValues(row, 'currentStock')}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{componentValues(row, 'activeCommitmentQuantity')}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-700">{componentValues(row, 'availableStock')}</td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          aria-label={`${row.poNumber} 검토수량`}
                          type="number"
                          min={0}
                          max={Math.min(row.maxQuantity, row.orderQuantity)}
                          value={quantity}
                          disabled={confirmation?.status === 'active'}
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
                          disabled={!short || confirmation?.status === 'active'}
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

      {channelAccountId ? (
        <RocketInventoryCommitmentList
          key={channelAccountId}
          channelAccountId={channelAccountId}
          channelAccountLabel={channelAccountName || channelAccountId}
          refreshKey={commitmentRefreshKey}
        />
      ) : null}

      <RocketMatchStatusModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        rows={matchRows}
        date={selectedDate || null}
      />
    </div>
  );
}
