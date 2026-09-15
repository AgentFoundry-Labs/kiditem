"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  ListChecks,
  Loader2,
  Package,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  isRocketWorkbookBlockingReason,
  ROCKET_SHORTAGE_REASONS,
  type RocketPurchasePreviewRow,
  type RocketShortageReason,
} from "@kiditem/shared/rocket-purchase-preview";
import { toast } from "sonner";
import { CollectionStartControl } from "@/components/collection/CollectionStartControl";
import { useRocketPoCollection } from "@/hooks/use-rocket-po-source";
import { cn, formatKRW, formatNumber } from "@/lib/utils";
import {
  clearCoupangCookiesViaExtension,
  isCoupangCookieBloatMessage,
} from "@/lib/coupang-cookie-recovery";
import {
  rocketReviewedQuantityLimit,
  useRocketPurchaseWorkflow,
} from "@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow";
import { SellpiaInventoryCollectionControl } from "@/components/collection/SellpiaInventoryCollectionControl";
import type { RocketDecisionWorkspaceContext } from "./RocketOrdersWorkspace";
import { RocketInlineRecipeEditor } from "./RocketInlineRecipeEditor";
import {
  RocketMatchStatusModal,
  rocketMatchStateLabel,
  rocketProductMatchingHref,
  type RocketMatchStatusRow,
} from "./RocketMatchStatusModal";
import { orderRocketPreviewRows } from "../lib/rocket-preview-row-order";

function componentValues(row: RocketPurchasePreviewRow): string {
  if (row.components.length === 0) return "—";
  return row.components
    .map((component) => `${component.code} · ${component.name}`)
    .join(" / ");
}

function componentQuantityValues(row: RocketPurchasePreviewRow): string {
  if (row.components.length === 0) return "—";
  return row.components
    .map(
      (component) =>
        `${component.optionName ?? "옵션 없음"} · 현재고 ${component.currentStock === null ? "미수집" : formatNumber(component.currentStock)} · 구성 ×${formatNumber(component.quantity)}`,
    )
    .join(" / ");
}

/**
 * 이 발주 한 건만 놓고 현재 재고로 몇 개까지 댈 수 있는지.
 *
 * 서버의 `maxQuantity` 는 한 미리보기 안에서 같은 SKU 를 나눠 쓰는 행들에 재고를 순서대로
 * 배분한 값이라 엑셀 대상(거래처확인요청) 행에서만 의미가 있다. 표시용 `all_rows` 스코프는
 * 이미 발주확정·거래명세서확인까지 포함하므로, 그 배분값을 그대로 쓰면 앞선 과거 발주가
 * 재고를 다 먹어 뒤 날짜가 전부 0 으로 보인다. 참고 행은 배분 없이 단독으로 계산한다.
 */
function standaloneCapacity(row: RocketPurchasePreviewRow): number {
  if (row.components.length === 0) return 0;
  const perComponent = row.components.map((component) =>
    component.quantity > 0 && component.currentStock !== null
      ? Math.floor(component.currentStock / component.quantity)
      : 0,
  );
  return Math.max(0, Math.min(row.orderQuantity, ...perComponent));
}

/**
 * 이 행에서 확정할 수 있는 최대 수량.
 *
 * 거래처확인요청 행은 서버가 SKU 경합까지 배분한 `maxQuantity` 가 유일한 근거다.
 * 표시용 행은 그 배분에서 굶어 0 이 나오므로 현재 재고 단독 여력을 쓴다.
 * `insufficient_capacity` 는 부분 확정이 금지된 상태라 항상 0 이다.
 */
function rowQuantityLimit(
  row: RocketPurchasePreviewRow,
  reviewable: boolean,
): number {
  // 부분 확정 금지는 엑셀에 실리는 행에만 걸린다. 표시용 행의 `insufficient_capacity` 는
  // 선행 발주가 재고를 먼저 가져간 배분의 산물이라 이 행의 실제 여력을 뜻하지 않는다.
  if (reviewable) {
    return row.reason === "insufficient_capacity"
      ? 0
      : rocketReviewedQuantityLimit(row);
  }
  return standaloneCapacity(row);
}

/**
 * 확정 수량 기본값. 조작한 값이 있으면 그 값이 이긴다.
 *
 * 전량 아니면 0 이다. 재고가 발주 수량을 다 채우지 못하면 부분 확정하지 않고 0 으로 둔다.
 * 엑셀에 실리는 행의 `insufficient_capacity` 정책과 같은 규칙이라, 표시와 정책이 어긋나지
 * 않는다. 부분 납품이 필요하면 조작자가 직접 수량을 넣는다.
 */
function rowQuantity(
  row: RocketPurchasePreviewRow,
  editedQuantity: number | undefined,
  reviewable: boolean,
): number {
  if (reviewable && row.reason === "insufficient_capacity") return 0;
  const edited = editedQuantity ?? row.editedQuantity;
  if (edited !== null && edited !== undefined) return edited;
  if (reviewable) return row.recommendedQuantity ?? 0;
  return rowQuantityLimit(row, reviewable) >= row.orderQuantity
    ? row.orderQuantity
    : 0;
}

/** 미리보기 표를 좁혀 보는 분류. 재고를 못 붙였거나 확정이 0 인 행만 골라내기 위한 것. */
type RowFilter = "all" | "unmatched" | "zero";

const ROW_FILTERS: { key: RowFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "unmatched", label: "재고 불일치" },
  { key: "zero", label: "확정재고 0" },
];

function isRowReviewBlocked(
  reason: RocketPurchasePreviewRow["reason"],
): boolean {
  return isRocketWorkbookBlockingReason(reason);
}

export function RocketConfirmPanel({
  activeMonth,
  channelAccountId,
  from,
  to,
  selectedSourceImportRunId,
  selectedDate: selectedDateProp,
  selectedDateSourceRunCount,
  onActivity,
  renderOrderExplorer,
}: RocketDecisionWorkspaceContext) {
  // 날짜 상태는 워크스페이스가 소유한다(URL 복원 포함). 패널은 읽기만 한다.
  const selectedDate = selectedDateProp ?? "";
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [editingRecipePoLineId, setEditingRecipePoLineId] = useState<
    string | null
  >(null);
  const [clearingCookies, setClearingCookies] = useState(false);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");

  // ⚠️ 파괴적: supplier 쿠키를 지우면 `.coupang.com` 공용 쿠키까지 걸려 WING·로켓에서 모두
  // 로그아웃된다. 그래서 실행 전에 그 영향 범위를 그대로 알리고 확인을 받는다.
  async function handleClearCoupangCookies() {
    if (clearingCookies) return;
    const confirmed = window.confirm(
      '쿠팡 쿠키를 정리할까요?\n\n'
        + 'supplier.coupang.com 쿠키를 지웁니다. 공용 쿠키가 함께 지워져 '
        + 'WING·로켓 등 모든 쿠팡 사이트에서 로그아웃됩니다. 정리 후 다시 로그인해야 합니다.',
    );
    if (!confirmed) return;
    setClearingCookies(true);
    const toastId = toast.loading('쿠팡 쿠키 정리 중…');
    try {
      const cleared = await clearCoupangCookiesViaExtension();
      toast.success(
        `쿠팡 쿠키 ${formatNumber(cleared)}개를 정리했습니다. 쿠팡에 다시 로그인한 뒤 수집해주세요.`,
        { id: toastId },
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : '쿠팡 쿠키 정리에 실패했습니다.',
        { id: toastId },
      );
    } finally {
      setClearingCookies(false);
    }
  }

  useEffect(() => {
    setEditingRecipePoLineId(null);
  }, [channelAccountId, selectedDate, selectedSourceImportRunId]);
  const {
    editedQuantities,
    setReviewedQuantity,
    preview,
    displayPreview,
    sourceRows,
    collectionRows,
    previewDirty,
    setPreviewDirty,
    shortageReasons,
    setShortageReasons,
    exporting,
    setTemplateFile,
    loading,
    error,
    inventoryCollectionRequired,
    collectionWarning,
    canExport,
    revalidateEditedQuantities,
    retryInventoryAndPreview,
    exportAndDownload,
  } = useRocketPurchaseWorkflow({
    channelAccountId,
    from,
    to,
    savedSourceImportRunId: selectedSourceImportRunId,
    selectedDeliveryDate: selectedDate || undefined,
    onActivity,
  });
  const rocketCollection = useRocketPoCollection(channelAccountId);

  // 매입단가는 검토 대상 밖 행에도 필요하므로 수집본 전체에서 찾고, 없으면 검토 행으로 보완한다.
  const sourceByLineId = useMemo(
    () =>
      new Map(
        [...(collectionRows ?? []), ...sourceRows].map((row) => [
          row.poLineId,
          row,
        ]),
      ),
    [collectionRows, sourceRows],
  );
  // 표에는 선택한 날짜의 발주를 상태와 무관하게 모두 보여준다(달력 건수와 맞추기 위함).
  // 수량 입력·엑셀 대상은 거래처확인요청 행(sourceRows)만이며, 그 외는 재고 참고용이다.
  const reviewableLineIds = useMemo(
    () => new Set(sourceRows.map(({ poLineId }) => poLineId)),
    [sourceRows],
  );
  const allRows = displayPreview?.rows ?? preview?.rows ?? [];
  const rows = allRows;
  // 분류는 보기만 좁힌다. 합계·부족 행 일괄 적용은 항상 전체 행을 기준으로 둔다.
  const filterCounts = {
    all: rows.length,
    unmatched: rows.filter((row) => row.components.length === 0).length,
    zero: rows.filter(
      (row) =>
        rowQuantity(
          row,
          editedQuantities[row.poLineId],
          reviewableLineIds.has(row.poLineId),
        ) === 0,
    ).length,
  } satisfies Record<RowFilter, number>;
  const filteredRows =
    rowFilter === "unmatched"
      ? rows.filter((row) => row.components.length === 0)
      : rowFilter === "zero"
        ? rows.filter(
            (row) =>
              rowQuantity(
                row,
                editedQuantities[row.poLineId],
                reviewableLineIds.has(row.poLineId),
              ) === 0,
          )
        : rows;
  const visibleRows = orderRocketPreviewRows(filteredRows, (row) =>
    rowQuantity(
      row,
      editedQuantities[row.poLineId],
      reviewableLineIds.has(row.poLineId),
    ),
  );
  const poCount = new Set(rows.map((row) => row.poNumber)).size;
  const previewDates = [
    ...new Set(rows.map((row) => row.plannedDeliveryDate)),
  ].sort();
  /**
   * 고른 날짜와 지금 들고 있는 수집본의 날짜가 다른 구간.
   *
   * 이때 옛 행을 그대로 그리면 두 가지가 나쁘다. 요청하지 않은 날짜의 발주를 잠깐 보여주고,
   * 수백 행을 한 번 더 렌더하느라 정작 요청이 늦게 나간다(307행이면 클릭 후 약 0.9초).
   * 그래서 이 구간에는 행을 그리지 않는다.
   */
  const awaitingSelectedDate =
    Boolean(selectedDate) &&
    previewDates.length > 0 &&
    !previewDates.includes(selectedDate);
  const previewRangeLabel =
    previewDates.length === 0
      ? `${from} ~ ${to}`
      : previewDates.length === 1
        ? previewDates[0]!
        : `수집본 전체 ${previewDates[0]} ~ ${previewDates.at(-1)}`;
  const eligibleShortageLineIds = rows.flatMap((row) => {
    const quantity = rowQuantity(
      row,
      editedQuantities[row.poLineId],
      reviewableLineIds.has(row.poLineId),
    );
    return !isRowReviewBlocked(row.reason) && quantity < row.orderQuantity
      ? [row.poLineId]
      : [];
  });
  // 부족 행은 사유가 있어야 엑셀이 열린다. 매번 고르게 하지 않고 기본 사유를 미리 넣어 둔다.
  // 이미 값이 있는 행은 건드리지 않으므로 조작자가 고른 사유를 덮어쓰지 않는다.
  const shortageSeedKey = eligibleShortageLineIds.join("|");
  useEffect(() => {
    if (eligibleShortageLineIds.length === 0) return;
    setShortageReasons((current) => {
      const missing = eligibleShortageLineIds.filter((id) => !current[id]);
      if (missing.length === 0) return current;
      return {
        ...current,
        ...Object.fromEntries(
          missing.map((id) => [id, ROCKET_SHORTAGE_REASONS[0]]),
        ),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortageSeedKey]);

  const confirmTotals = rows.reduce(
    (acc, row) => {
      const quantity = rowQuantity(
        row,
        editedQuantities[row.poLineId],
        reviewableLineIds.has(row.poLineId),
      );
      const unitPrice =
        sourceByLineId.get(row.poLineId)?.confirmation?.purchasePrice ?? 0;
      return {
        qty: acc.qty + quantity,
        amount: acc.amount + unitPrice * quantity,
        short: acc.short + (quantity < row.orderQuantity ? 1 : 0),
        // 일별 목록을 흡수했으므로 발주 원본 수량·금액도 여기서 같이 보여준다.
        orderQty: acc.orderQty + row.orderQuantity,
        orderAmount: acc.orderAmount + unitPrice * row.orderQuantity,
      };
    },
    { qty: 0, amount: 0, short: 0, orderQty: 0, orderAmount: 0 },
  );
  const matchRows: RocketMatchStatusRow[] = rows.map((row) => ({
    poLineId: row.poLineId,
    poNumber: row.poNumber,
    productNo: row.productNo,
    productName: row.productName,
    barcode: sourceByLineId.get(row.poLineId)?.barcode ?? "",
    orderQuantity: row.orderQuantity,
    reason: row.reason,
    channelListingOptionId: row.channelListingOptionId,
    components: row.components,
  }));
  const hasBlockingRows = rows.some((row) =>
    isRocketWorkbookBlockingReason(row.reason),
  );
  const busy = loading || exporting;
  /**
   * 엑셀은 "거래처확인요청 발주에 납품 가능 수량을 회신"하는 파일이다. 그래서 그 상태의
   * 발주가 없으면 만들 게 없어 버튼이 잠긴다. 이유를 적어두지 않으면 고장으로 보인다.
   */
  const exportBlockReason = canExport
    ? null
    : !preview
      ? "수집본을 불러오는 중입니다."
      : preview.rows.length === 0
        ? "거래처확인요청 상태의 발주가 없어 회신할 내용이 없습니다."
        : hasBlockingRows
          ? "상품·재고 연결이 필요한 행이 남아 있습니다."
          : previewDirty
            ? "수량을 바꿨습니다. 다시 검증해주세요."
            : "검토가 끝나지 않은 행이 있습니다.";

  function handleExplorerDateSelection(
    _date: string | null,
    _sourceRunCount: number,
  ) {
    // 날짜/수집본 수는 워크스페이스가 내려준다. 패널은 날짜가 바뀌면 매칭 모달만 닫는다.
    setMatchModalOpen(false);
  }

  function editQuantity(row: RocketPurchasePreviewRow, quantity: number) {
    const bounded = Math.max(
      0,
      Math.min(
        rowQuantityLimit(row, reviewableLineIds.has(row.poLineId)),
        quantity,
      ),
    );
    setReviewedQuantity(row.poLineId, bounded);
    setShortageReasons((current) => {
      if (bounded >= row.orderQuantity) {
        const next = { ...current };
        delete next[row.poLineId];
        return next;
      }
      return {
        ...current,
        [row.poLineId]: current[row.poLineId] ?? ROCKET_SHORTAGE_REASONS[0],
      };
    });
  }

  async function handleExport() {
    const result = await exportAndDownload();
    if (result) {
      toast.success(
        `쿠팡 엑셀 다운로드 — ${formatNumber(result.totals.workbookQuantity)}개`,
      );
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-purple-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-purple-600" />
            <span className="text-sm font-semibold text-slate-900">
              로켓 PO 보관 · 입고예정일 달력
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {loading ? (
              <span className="inline-flex items-center gap-1.5 self-center text-xs font-medium text-slate-500">
                <Loader2 size={13} className="animate-spin" />
                저장본 계산 중…
              </span>
            ) : null}
            <CollectionStartControl
              control={rocketCollection}
              startLabel="이 달 쿠팡 PO 수집·보관"
              startTitle={`${activeMonth} 입고예정 발주를 선택한 로켓 계정에서 모든 상태로 수집합니다.`}
              startBlockedReason={channelAccountId
                ? null
                : "쿠팡 익스텐션 계정을 자동으로 연결하는 중입니다. 잠시 후 다시 시도해주세요."}
              onStart={() => rocketCollection.start({ from, to })}
              onStop={rocketCollection.stop}
            />
          </div>
        </div>

        <div className="p-4">
          {renderOrderExplorer({
            disabled: busy,
            onSelectDate: handleExplorerDateSelection,
          })}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>
              최신 PO 수집본 → 최신 Sellpia 재고 즉시 비교 → 수량·부족사유 검토 →
              엑셀 생성 시 최신 재고 재검증
              {loading ? (
                <Loader2
                  size={13}
                  className="ml-1.5 inline animate-spin text-purple-500"
                />
              ) : null}
            </span>
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <Upload size={13} /> 쿠팡 양식 파일 선택
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setTemplateFile(file);
                  if (file)
                    toast.success(
                      `${file.name} 양식을 선택했습니다. 쿠팡 엑셀 생성에 사용합니다.`,
                    );
                  event.target.value = "";
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

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700"
        >
          {error}
          {/* 재고 수집은 여기서 시작하지 않는다. 공용 재고 수집 컨트롤을 보여 주고, 계산은 운영자가 다시 누른다. */}
          {inventoryCollectionRequired ? (
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs text-rose-600">
                셀피아 재고 수집이 끝난 뒤 다시 계산해 주세요.
              </p>
              <div className="flex flex-wrap items-start gap-2">
                <SellpiaInventoryCollectionControl />
                <button
                  type="button"
                  onClick={() => retryInventoryAndPreview()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  <RefreshCw size={13} />
                  재고 반영해 다시 계산
                </button>
              </div>
            </div>
          ) : null}
          {/* 쿠키 과다(HTTP 400)는 재시도로 안 풀리고 쿠키를 비워야 복구된다. 그 자리에서 바로 조치. */}
          {isCoupangCookieBloatMessage(error) ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => void handleClearCoupangCookies()}
                disabled={clearingCookies}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {clearingCookies ? <Loader2 size={13} className="animate-spin" /> : null}
                쿠팡 쿠키 정리
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {collectionWarning ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800"
        >
          {collectionWarning}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <div className="text-sm font-semibold text-slate-900">
              미리보기 · 편집{" "}
              <span className="text-xs font-normal text-slate-400">
                {previewRangeLabel} · 발주 {poCount}건 · {rows.length}행
                {selectedSourceImportRunId
                  ? ` · 수집본 ${selectedSourceImportRunId.slice(0, 8)}`
                  : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500">
                발주{" "}
                <b className="tabular-nums text-slate-900">
                  {formatNumber(confirmTotals.orderQty)}
                </b>
                개 ·{" "}
                <b className="tabular-nums text-slate-900">
                  {formatKRW(confirmTotals.orderAmount)}
                </b>
                원 / 확정{" "}
                <b className="tabular-nums text-slate-900">
                  {formatNumber(confirmTotals.qty)}
                </b>
                개 · 부족{" "}
                <b className="tabular-nums text-amber-600">
                  {confirmTotals.short}
                </b>
                행 · 금액{" "}
                <b className="tabular-nums text-purple-700">
                  {formatKRW(confirmTotals.amount)}
                </b>
                원
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
                title={exportBlockReason ?? undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800",
                  (!canExport || busy) && "pointer-events-none opacity-60",
                )}
              >
                {exporting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                쿠팡 엑셀 다운로드
              </button>
              {exportBlockReason ? (
                <p className="w-full text-right text-xs text-amber-700">
                  엑셀 다운로드 불가 — {exportBlockReason}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              {ROW_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={rowFilter === key}
                  onClick={() => setRowFilter(key)}
                  className={cn(
                    "rounded-md border px-2 py-1 font-medium",
                    rowFilter === key
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {label} {formatNumber(filterCounts[key])}
                </button>
              ))}
            </div>
            <p className="min-w-[280px] flex-1">
              Sellpia 원재고는 물리 재고입니다. 납품가능은 거래처확인요청 행이면
              구성수량과 같은 수집본의 선행 발주 배정까지 반영한 최대 수량이고,
              이미 진행된 발주 행이면 현재 재고만으로 계산한 참고값입니다. 확정재고는
              전량 아니면 0 이며, 부분 납품은 직접 수량을 넣어야 합니다.
            </p>
          </div>

          <div className="max-h-[calc(100vh-320px)] min-h-[460px] overflow-auto">
            <table className="min-w-[980px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">
                    발주번호
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    상품 (바코드)
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">발주</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    발주금액
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Sellpia 원재고
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">구성</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    납품가능
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    확정재고
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    납품부족사유
                  </th>
                </tr>
              </thead>
              <tbody>
                {awaitingSelectedDate ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-10 text-center text-sm text-slate-400"
                    >
                      {selectedDate} 발주를 불러오는 중입니다…
                    </td>
                  </tr>
                ) : null}
                {(awaitingSelectedDate ? [] : visibleRows).map((row) => {
                  const source = sourceByLineId.get(row.poLineId);
                  const reviewable = reviewableLineIds.has(row.poLineId);
                  const quantity = rowQuantity(
                    row,
                    editedQuantities[row.poLineId],
                    reviewable,
                  );
                  const short = quantity < row.orderQuantity;
                  const blocking = isRowReviewBlocked(row.reason);
                  const matchingBlocked = isRocketWorkbookBlockingReason(
                    row.reason,
                  );
                  const matchStateLabel = rocketMatchStateLabel(row.reason);
                  return (
                    <Fragment key={row.poLineId}>
                      <tr
                        className={cn(
                          "border-t border-slate-100",
                          blocking
                            ? "bg-rose-50/40"
                            : short && "bg-amber-50/40",
                        )}
                      >
                        {/* 별도 일별 목록을 없애고 그 PO 정보(센터·입고유형·상태·발주일시)를 여기로 흡수했다. */}
                        <td className="whitespace-nowrap px-3 py-1.5 text-[11px] text-slate-500">
                          <div className="font-mono">{row.poNumber}</div>
                          {source?.confirmation ? (
                            <>
                              <div className="text-slate-400">
                                {source.confirmation.center}
                                {source.confirmation.inboundType
                                  ? ` · ${source.confirmation.inboundType}`
                                  : ""}
                              </div>
                              <div className="text-slate-400">
                                {source.confirmation.poRegisteredAt?.slice(0, 16)}
                              </div>
                              <span
                                className={cn(
                                  "mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  reviewable
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-slate-100 text-slate-500",
                                )}
                              >
                                {source.confirmation.poStatus}
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td className="max-w-[260px] px-3 py-1.5">
                          <div className="truncate text-slate-700">
                            <Package
                              size={11}
                              className="mr-1 inline text-purple-400"
                            />
                            {row.productName}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {source?.barcode || "—"}
                          </div>
                          {/* 어떤 Sellpia 상품에 붙었는지를 상품명 바로 밑에서 확인한다. */}
                          <div
                            className={cn(
                              "truncate text-[11px]",
                              row.components.length === 0
                                ? "font-semibold text-rose-600"
                                : "text-slate-500",
                            )}
                            title={
                              row.components.length === 0
                                ? undefined
                                : componentValues(row)
                            }
                          >
                            {row.components.length === 0
                              ? "Sellpia 미매칭"
                              : componentValues(row)}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                blocking
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-emerald-50 text-emerald-700",
                              )}
                            >
                              {matchStateLabel}
                            </span>
                            {row.masterProductId && row.channelListingOptionId ? (
                              <button
                                type="button"
                                aria-label={`${row.productName} Sellpia 재고 ${row.components.length > 0 ? "수정" : "연결"}`}
                                disabled={busy}
                                onClick={() =>
                                  setEditingRecipePoLineId((current) =>
                                    current === row.poLineId
                                      ? null
                                      : row.poLineId,
                                  )
                                }
                                className="text-[10px] font-semibold text-purple-700 hover:underline disabled:opacity-50"
                              >
                                {editingRecipePoLineId === row.poLineId
                                  ? "재고 연결 닫기"
                                  : row.components.length > 0
                                    ? "Sellpia 재고 수정"
                                    : "Sellpia 재고 연결"}
                              </button>
                            ) : matchingBlocked ? (
                              <a
                                href={rocketProductMatchingHref({
                                  channelAccountId,
                                  productNo: row.productNo,
                                  channelListingOptionId: row.channelListingOptionId,
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
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                          {formatNumber(row.orderQuantity)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500">
                          {source?.confirmation
                            ? `${formatKRW(source.confirmation.purchasePrice * row.orderQuantity)}원`
                            : "—"}
                        </td>
                        {/* 상품명은 왼쪽 칸으로 옮겼으므로 여기는 실제 재고 숫자만 본다. */}
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                          {row.components.length === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            row.components.map((component) => (
                              <div key={component.sellpiaInventorySkuId}>
                                <span className="text-sm font-semibold">
                                  {component.currentStock === null
                                    ? "미수집"
                                    : formatNumber(component.currentStock)}
                                </span>
                                {component.optionName ? (
                                  <span className="ml-1.5 text-[10px] text-slate-400">
                                    {component.optionName}
                                  </span>
                                ) : null}
                              </div>
                            ))
                          )}
                        </td>
                        {/* 구성 배수는 원재고와 섞이지 않도록 자체 열로 둔다. */}
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                          {row.components.length === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            row.components.map((component) => (
                              <div key={component.sellpiaInventorySkuId}>
                                ×{formatNumber(component.quantity)}
                              </div>
                            ))
                          )}
                        </td>
                        {/*
                          이번에 결정할 행(거래처확인요청)은 서버가 SKU 경합까지 반영해 배분한
                          maxQuantity 가 확정재고의 근거다. 그 외 행은 이미 지나간 발주라
                          배분 대상이 아니므로 현재 재고 단독 기준 여력을 참고용으로 보여준다.
                        */}
                        <td
                          aria-label={
                            reviewable
                              ? `${row.poNumber} 납품가능 ${row.maxQuantity === null ? "미수집" : `${row.maxQuantity}개`}`
                              : `${row.poNumber} 납품가능 참고 ${standaloneCapacity(row)}개`
                          }
                          title={
                            reviewable
                              ? undefined
                              : "이미 진행된 발주라 참고용입니다. 현재 재고만으로 계산한 값이며 이번 납품 판단 대상이 아닙니다."
                          }
                          className={cn(
                            "px-3 py-1.5 text-right font-semibold tabular-nums",
                            !reviewable
                              ? "text-slate-400"
                              : row.maxQuantity === null || row.maxQuantity < row.orderQuantity
                                ? "text-amber-700"
                                : "text-slate-700",
                          )}
                        >
                          {reviewable && row.maxQuantity === null
                            ? "미수집"
                            : formatNumber(
                                reviewable
                                  ? row.maxQuantity!
                                  : standaloneCapacity(row),
                              )}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            aria-label={`${row.poNumber} 확정재고`}
                            type="number"
                            min={0}
                            max={rowQuantityLimit(row, reviewable)}
                            value={quantity}
                            disabled={
                              blocking || row.reason === "insufficient_capacity"
                            }
                            onChange={(event) =>
                              editQuantity(row, Number(event.target.value) || 0)
                            }
                            className={cn(
                              "w-20 rounded-md border px-2 py-1 text-right text-sm tabular-nums",
                              short
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-slate-200",
                            )}
                          />
                        </td>
                        {/*
                          사유 목록은 20개짜리라 모든 행에 select 를 깔면 옵션이 수천 개가 되어
                          날짜를 바꿀 때마다 렌더가 눈에 띄게 밀린다. 사유를 고를 수 있는 행에만
                          select 를 그리고, 나머지는 텍스트로 대신한다.
                        */}
                        <td className="px-3 py-1.5">
                          {short && !blocking ? (
                            <select
                              aria-label={`${row.poNumber} 납품부족사유`}
                              value={shortageReasons[row.poLineId] ?? ""}
                              onChange={(event) => {
                                setShortageReasons((current) => ({
                                  ...current,
                                  [row.poLineId]: event.target
                                    .value as RocketShortageReason,
                                }));
                                setPreviewDirty(true);
                              }}
                              className="w-full max-w-[280px] rounded-md border border-slate-200 px-2 py-1 text-xs"
                            >
                              <option value="">사유 선택</option>
                              {ROCKET_SHORTAGE_REASONS.map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              aria-label={`${row.poNumber} 납품부족사유`}
                              className="block w-full max-w-[280px] rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-300"
                            >
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                      {editingRecipePoLineId === row.poLineId &&
                      row.masterProductId && row.channelListingOptionId ? (
                        <tr className="border-t border-purple-100 bg-purple-50/30">
                          <td colSpan={9} className="px-3 py-3">
                            <RocketInlineRecipeEditor
                              masterProductId={row.masterProductId}
                              channelListingOptionId={row.channelListingOptionId}
                              productName={row.productName}
                              existingComponents={row.components}
                              onCancel={() => setEditingRecipePoLineId(null)}
                              onSaved={async () => {
                                await revalidateEditedQuantities();
                                setEditingRecipePoLineId(null);
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {preview && rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
          {selectedDate && selectedDateSourceRunCount > 0 && preview.rows.length === 0
            ? "선택한 날짜의 PO는 저장되어 있지만 모두 발주확정 상태라 엑셀 검토 대상이 아닙니다."
            : "검토할 로켓 발주가 없습니다."}
        </div>
      ) : null}

      {/*
        미리보기가 없을 때의 안내. 예전에는 아래 표들이 모두 `preview` 에 걸려 있고 빈 상태 문구까지
        `preview &&` 로 막혀 있어, 실패하거나 수집본을 못 고른 경우 하단이 통째로 사라졌다.
        재고 수치는 여기서 보여주지 않는다 — stale 재고로 납품 수량을 노출하지 않는다는 경계는 유지한다.
      */}
      {!preview && !loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            {error
              ? "납품 판단 영역을 불러오지 못했습니다."
              : selectedDate && selectedDateSourceRunCount === 0
                ? "선택한 날짜에 저장된 발주가 없습니다."
                : "납품 판단을 시작할 수집본이 없습니다."}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {error
              ? "위 안내를 해결한 뒤 다시 시도해 주세요."
              : "최신 쿠팡 PO를 새로 수집해 주세요."}
          </p>
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
