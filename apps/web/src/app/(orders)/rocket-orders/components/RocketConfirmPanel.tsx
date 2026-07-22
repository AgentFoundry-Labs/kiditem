'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  matchRocketStock,
  type RocketStockMatchRow,
} from '@/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api';
import type { RocketDecisionWorkspaceContext } from './RocketOrdersWorkspace';
import {
  computeStockAutoFillQuantities,
  computeStockAutoFillReasons,
  type AutoFillMatch,
  type AutoFillRow,
} from '../lib/rocket-stock-autofill';
import {
  RocketMatchStatusModal,
  type RocketMatchStatusRow,
} from './RocketMatchStatusModal';

/** 얕은 값 비교(불필요한 setState 재렌더 방지). */
function recordsEqual<T>(a: Record<string, T>, b: Record<string, T>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

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

/** 재고 부족/없음일 때 자동 선택하는 기본 납품부족사유(사용자 지정). 행별로 변경 가능. */
const DEFAULT_SHORTAGE_REASON: RocketShortageReason = '협력사 재고부족 - 재고 할당정책';

/** 미리보기 매칭 조회 상태. */
type PreviewMatchState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  byLineId: Map<string, RocketStockMatchRow>;
};

export function RocketConfirmPanel({
  onSaved,
  activeMonth,
  channelAccountId,
  channelAccountName,
  hasConfiguredVendorId,
  from,
  to,
  selectedSourceImportRunId,
  primarySourceImportRunId,
  onActivity,
  onOrdersChanged,
  renderOrderExplorer,
}: { onSaved: () => void } & RocketDecisionWorkspaceContext) {
  // 날짜를 고르면 그 수집본, 아니면 조회범위 전체 수집본으로 매칭한다.
  const matchSourceImportRunId = selectedSourceImportRunId ?? primarySourceImportRunId;
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDateSourceRunCount, setSelectedDateSourceRunCount] = useState(0);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [commitmentRefreshKey, setCommitmentRefreshKey] = useState(0);
  // 바코드 매칭(저장 수집본 → 셀피아 재고) 결과. preview 매칭행보다 우선 표시한다.
  const [barcodeMatchRows, setBarcodeMatchRows] = useState<RocketMatchStatusRow[] | null>(null);
  const [barcodeMatchLoading, setBarcodeMatchLoading] = useState(false);
  // 미리보기 표 매칭 결과(poLineId → 서버 매칭행: 가용재고·서버 공동할당 확정수량 포함).
  const [previewMatch, setPreviewMatch] = useState<PreviewMatchState>({ status: 'idle', byLineId: new Map() });
  // 사용자가 직접 수정한 행 — 자동채움이 덮어쓰지 않는다.
  const [touchedLineIds, setTouchedLineIds] = useState<Set<string>>(new Set());
  // 매칭 요청 세대 토큰 — 계정/수집본 변경 시 이전 응답을 무시(stale 방지).
  const matchGenerationRef = useRef(0);
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
    exportStockWorkbook,
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
  const serverMatchFor = (row: RocketPurchasePreviewRow): RocketStockMatchRow | undefined =>
    row.components.length > 0 ? undefined : previewMatch.byLineId.get(row.poLineId);
  // 확정수량 상한(발주 단위): 등록=레시피 가용, 미등록=서버 공동할당 confirmQuantity(가용재고·약정·팩 반영).
  const capFor = (row: RocketPurchasePreviewRow): number => {
    if (row.components.length > 0) return Math.min(row.orderQuantity, row.maxQuantity);
    const match = serverMatchFor(row);
    return match?.matched ? match.confirmQuantity : 0;
  };
  // 확정수량 기본값: 등록=백엔드 추천, 미등록=서버 confirmQuantity.
  const defaultQtyFor = (row: RocketPurchasePreviewRow): number =>
    row.components.length > 0 ? row.recommendedQuantity : capFor(row);
  // 표시·검증·엑셀 공통 확정수량(사용자 편집 우선).
  const confirmQtyFor = (row: RocketPurchasePreviewRow): number =>
    editedQuantities[row.poLineId] ?? defaultQtyFor(row);
  const confirmTotals = rows.reduce((acc, row) => {
    const quantity = confirmQtyFor(row);
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

  // 미리보기가 뜨면 그 수집본을 셀피아 재고에 매칭(바코드→이름→퍼지)해 "셀피아 재고" 칸을 채운다.
  // ⭐미리보기가 보여주는 실제 날짜범위(previewDates)로 매칭한다. 달력 from/to 로 스코핑하면
  // 수집본 전체(예: 05-29~07-31)를 보여줄 때 범위 밖 행이 매칭 결과에 없어 전부 '—' 로 뜬다.
  const previewRowCount = preview?.rows.length ?? 0;
  const previewFrom = previewDates[0] ?? '';
  const previewTo = previewDates.at(-1) ?? '';
  // 계정/수집본이 바뀌면 매칭·편집 흔적을 초기화한다(이전 수집본 결과가 남지 않도록).
  // 이미 초기 상태면 같은 참조를 반환해 불필요한 재렌더를 만들지 않는다.
  useEffect(() => {
    matchGenerationRef.current += 1;
    setPreviewMatch((prev) => (prev.status === 'idle' && prev.byLineId.size === 0 ? prev : { status: 'idle', byLineId: new Map() }));
    setTouchedLineIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [channelAccountId, matchSourceImportRunId]);

  // 미리보기가 뜨면 그 수집본을 셀피아 재고에 매칭(바코드→이름→퍼지)해 "셀피아 재고" 칸을 채운다.
  // ⭐미리보기가 보여주는 실제 날짜범위(previewDates)로 매칭한다. 세대 토큰으로 stale 응답을 무시하고,
  // 실패는 재고 0 이 아니라 error 상태로 구분한다(자동채움·엑셀 차단).
  useEffect(() => {
    if (previewRowCount === 0 || !channelAccountId || !matchSourceImportRunId) {
      setPreviewMatch((prev) => (prev.status === 'idle' && prev.byLineId.size === 0 ? prev : { status: 'idle', byLineId: new Map() }));
      return;
    }
    const generation = (matchGenerationRef.current += 1);
    setPreviewMatch((prev) => ({ status: 'loading', byLineId: prev.byLineId }));
    const scope = previewFrom && previewTo
      ? { channelAccountId, sourceImportRunId: matchSourceImportRunId, fromDate: previewFrom, toDate: previewTo }
      : { channelAccountId, sourceImportRunId: matchSourceImportRunId };
    matchRocketStock(scope)
      .then((matched) => {
        if (generation !== matchGenerationRef.current) return; // stale 응답 무시
        setPreviewMatch({ status: 'ready', byLineId: new Map(matched.map((row) => [row.poLineId, row])) });
      })
      .catch(() => {
        if (generation !== matchGenerationRef.current) return;
        // 실패를 재고 0 으로 처리하지 않는다 — 이전 데이터를 유지하고 error 로 표시.
        setPreviewMatch((prev) => ({ status: 'error', byLineId: prev.byLineId }));
      });
  }, [previewRowCount, channelAccountId, matchSourceImportRunId, previewFrom, previewTo]);

  // 매칭이 성공(ready)하면 미등록 상품의 확정수량을 서버 공동할당값으로 자동 채운다.
  // 사용자가 직접 고친 행(touched)은 건드리지 않는다. 부족 행은 기본 사유도 상태에 기록(표시=검증=엑셀 단일 소스).
  useEffect(() => {
    if (previewMatch.status !== 'ready' || rows.length === 0) return;
    const autoFillRows: AutoFillRow[] = rows.map((row) => ({
      poLineId: row.poLineId, orderQuantity: row.orderQuantity, hasRecipe: row.components.length > 0,
    }));
    const matchMap = new Map<string, AutoFillMatch>(
      [...previewMatch.byLineId].map(([id, m]) => [id, { matched: m.matched, confirmQuantity: m.confirmQuantity }]),
    );
    setEditedQuantities((current) => {
      const next = computeStockAutoFillQuantities(autoFillRows, matchMap, touchedLineIds, current);
      return recordsEqual(current, next) ? current : next;
    });
    setShortageReasons((current) => {
      const quantities = computeStockAutoFillQuantities(autoFillRows, matchMap, touchedLineIds, editedQuantities);
      const next = computeStockAutoFillReasons(autoFillRows, quantities, touchedLineIds, current, DEFAULT_SHORTAGE_REASON);
      return recordsEqual(current, next) ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMatch, touchedLineIds, previewRowCount]);

  function handleExplorerDateSelection(date: string | null, sourceRunCount: number) {
    setSelectedDate(date ?? '');
    setSelectedDateSourceRunCount(sourceRunCount);
    setMatchModalOpen(false);
    setBarcodeMatchRows(null);
  }

  async function collectMonth() {
    if (!channelAccountId) {
      toast.error('활성 로켓 채널 계정이 필요합니다.');
      return;
    }
    await recalculate();
    onOrdersChanged();
  }

  // 선택한 수집본 상품을 셀피아 재고에 바코드로 매칭해 현황 모달을 연다(read-only).
  async function runRocketStockMatch() {
    if (!channelAccountId || !matchSourceImportRunId) {
      toast.error('조회할 로켓 발주가 없습니다.');
      return;
    }
    setBarcodeMatchLoading(true);
    try {
      // 날짜를 골랐으면 그 입고예정일만, 아니면 조회범위(from~to)로 서버에서 스코핑한다.
      const rows = await matchRocketStock(
        selectedDate
          ? { channelAccountId, sourceImportRunId: matchSourceImportRunId, fromDate: selectedDate, toDate: selectedDate }
          : { channelAccountId, sourceImportRunId: matchSourceImportRunId, fromDate: from, toDate: to },
      );
      setBarcodeMatchRows(
        rows.map((row) => ({
          poLineId: row.poLineId,
          poNumber: row.poNumber,
          productName: row.productName,
          barcode: row.barcode,
          orderQuantity: row.orderQuantity,
          availableStock: row.availableStock,
          mapped: row.matched,
          matchType: row.matchType,
          sellpiaName: row.sellpiaName,
        })),
      );
      setMatchModalOpen(true);
      const barcodeCount = rows.filter((row) => row.matchType === 'barcode').length;
      const matchedCount = rows.filter((row) => row.matched).length;
      toast.success(
        `셀피아 매칭 ${formatNumber(matchedCount)}/${formatNumber(rows.length)}행 (바코드 ${formatNumber(barcodeCount)})`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '셀피아 매칭에 실패했습니다.');
    } finally {
      setBarcodeMatchLoading(false);
    }
  }

  function editQuantity(row: RocketPurchasePreviewRow, quantity: number) {
    const bounded = Math.max(0, Math.min(row.orderQuantity, capFor(row), quantity));
    // 사용자가 만진 행 — 자동채움이 덮어쓰지 않는다.
    setTouchedLineIds((prev) => {
      if (prev.has(row.poLineId)) return prev;
      const next = new Set(prev);
      next.add(row.poLineId);
      return next;
    });
    setEditedQuantities((current) => ({ ...current, [row.poLineId]: bounded }));
    // 수동 편집 행은 부족사유를 비워 운영자가 명시적으로 고르게 한다(자동채움은 로드 시 effect 담당).
    setShortageReasons((current) => {
      if (!(row.poLineId in current)) return current;
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

  // 셀피아 재고 기준 확정수량/부족사유로 쿠팡 발주확정 엑셀을 만든다(레시피/서버 예약 없이).
  async function exportStockExcel() {
    if (rows.length === 0) {
      toast.error('내보낼 발주가 없습니다.');
      return;
    }
    // 매칭이 성공(ready)하지 않았으면 확정수량을 신뢰할 수 없어 내보내지 않는다(오류를 재고 0 으로 오해 방지).
    if (previewMatch.status !== 'ready') {
      toast.error(
        previewMatch.status === 'error'
          ? '셀피아 재고 매칭에 실패했습니다. 매칭이 성공한 뒤 다시 시도해 주세요.'
          : '셀피아 재고 매칭을 기다리는 중입니다. 잠시 후 다시 시도해 주세요.',
      );
      return;
    }
    const confirmedRows = rows.map((row) => {
      const qty = confirmQtyFor(row);
      const reason: RocketShortageReason | null =
        qty < row.orderQuantity ? (shortageReasons[row.poLineId] ?? DEFAULT_SHORTAGE_REASON) : null;
      return { poLineId: row.poLineId, confirmedQuantity: qty, shortageReason: reason };
    });
    const ok = await exportStockWorkbook(confirmedRows);
    if (ok) {
      onSaved();
      toast.success(
        `재고 기준 발주확정 엑셀 생성 — 확정 ${formatNumber(confirmTotals.qty)}개 · 부족 ${confirmTotals.short}행`,
      );
    } else {
      toast.error('엑셀 생성에 실패했습니다. 상단 안내 메시지를 확인해 주세요.');
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
              onClick={() => void runRocketStockMatch()}
              disabled={barcodeMatchLoading || !channelAccountId || !matchSourceImportRunId}
              title="쿠팡 로켓 발주 상품을 셀피아 재고에 바코드로 매칭합니다(날짜 선택 시 그 날짜만)."
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100',
                (barcodeMatchLoading || !channelAccountId || !matchSourceImportRunId) && 'pointer-events-none opacity-60',
              )}
            >
              {barcodeMatchLoading ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />}
              쿠팡 로켓 매칭
            </button>
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
                onClick={() => void exportStockExcel()}
                disabled={busy || rows.length === 0 || previewMatch.status !== 'ready'}
                title={previewMatch.status === 'ready'
                  ? '셀피아 재고 기준 확정수량·부족사유로 쿠팡 발주확정 엑셀을 생성합니다.'
                  : '셀피아 재고 매칭이 완료된 뒤 활성화됩니다.'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100',
                  (busy || rows.length === 0 || previewMatch.status !== 'ready') && 'pointer-events-none opacity-60',
                )}
              >
                {confirming || previewMatch.status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                재고 기준 엑셀
              </button>
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={!canConfirm || busy}
                title="레시피 기반 정식 확정(재고 예약). 등록상품 + 완전수집일 때만 활성화됩니다."
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
                  <th className="px-3 py-2 text-right font-semibold">셀피아 가용재고</th>
                  <th className="px-3 py-2 text-right font-semibold">확정수량</th>
                  <th className="px-3 py-2 text-left font-semibold">납품부족사유</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const source = sourceByLineId.get(row.poLineId);
                  const hasRecipe = row.components.length > 0;
                  const match = hasRecipe ? undefined : previewMatch.byLineId.get(row.poLineId);
                  const matched = Boolean(match?.matched);
                  const isUnmatched = Boolean(match) && !matched;
                  // 확정수량 = 편집값 우선, 없으면 서버 공동할당(등록은 백엔드 추천).
                  const quantity = confirmQtyFor(row);
                  const short = quantity < row.orderQuantity;
                  const reasonValue = shortageReasons[row.poLineId] ?? '';
                  const packSize = match?.packSize ?? 1;
                  const availPacks = matched ? Math.floor((match!.availableStock ?? 0) / packSize) : 0;
                  // 셀피아 가용재고: 등록=레시피 가용, 미등록=가용재고(현재고-약정). 매칭 상태별 문구.
                  const stockText = hasRecipe
                    ? componentValues(row, 'availableStock')
                    : matched
                      ? formatNumber(match!.availableStock ?? 0)
                      : match
                        ? '미매칭'
                        : previewMatch.status === 'loading'
                          ? '매칭 중…'
                          : previewMatch.status === 'error'
                            ? '매칭 오류'
                            : '—';
                  return (
                    <tr key={row.poLineId} className={cn('border-t border-slate-100', short && 'bg-amber-50/40')}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-slate-500">{row.poNumber}</td>
                      <td className="max-w-[260px] px-3 py-1.5">
                        <div className="truncate text-slate-700"><Package size={11} className="mr-1 inline text-purple-400" />{row.productName}</div>
                        <div className="truncate font-mono text-[10px] text-slate-400">
                          {source?.barcode || '—'}
                          {matched ? (
                            <span
                              className={cn(
                                match!.matchType === 'barcode' && 'text-emerald-600',
                                match!.matchType === 'name' && 'text-sky-600',
                                match!.matchType === 'name-fuzzy' && 'text-amber-600',
                              )}
                            >
                              {' · '}
                              {match!.matchType === 'name-fuzzy' ? '유사? ' : null}
                              {match!.sellpiaName}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{formatNumber(row.orderQuantity)}</td>
                      <td className={cn('px-3 py-1.5 text-right font-semibold tabular-nums', isUnmatched ? 'text-red-500' : 'text-slate-700')}>
                        <div>{stockText}</div>
                        {matched ? (
                          <div className="text-[10px] font-normal text-slate-400">
                            현재고 {formatNumber(match!.currentStock ?? 0)}
                            {(match!.activeCommitmentQuantity ?? 0) > 0 ? ` · 약정 ${formatNumber(match!.activeCommitmentQuantity ?? 0)}` : ''}
                            {packSize > 1 ? ` · ÷${packSize}=${formatNumber(availPacks)}팩` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          aria-label={`${row.poNumber} 검토수량`}
                          type="number"
                          min={0}
                          max={capFor(row)}
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
                          value={reasonValue}
                          disabled={!short || confirmation?.status === 'active'}
                          onChange={(event) => {
                            const value = event.target.value;
                            setTouchedLineIds((prev) => {
                              if (prev.has(row.poLineId)) return prev;
                              const next = new Set(prev);
                              next.add(row.poLineId);
                              return next;
                            });
                            setShortageReasons((current) => {
                              const next = { ...current };
                              if (value) next[row.poLineId] = value as RocketShortageReason;
                              else delete next[row.poLineId];
                              return next;
                            });
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
        rows={barcodeMatchRows ?? matchRows}
        date={selectedDate || null}
        title={barcodeMatchRows ? '쿠팡 로켓 · 셀피아 재고 매칭' : '매칭 현황'}
        matchedFirst={Boolean(barcodeMatchRows)}
      />
    </div>
  );
}
