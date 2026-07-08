'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  approveSellpiaSnapshotItems,
  approveSellpiaSnapshotItem,
  ignoreSellpiaSnapshotItems,
  ignoreSellpiaItem,
  importSellpiaInventoryFile,
  resolveSellpiaCandidate,
} from '../../_shared/inventory-api';
import {
  canBulkApproveSellpiaRow,
  filterSellpiaRows,
  getSellpiaBulkApprovalBlockReason,
  getSellpiaFilterCount,
  getSellpiaRowBadges,
  requiresSellpiaRowReason,
  type SellpiaReviewFilter,
} from '../lib/sellpia-review-ui';
import {
  SELLPIA_WORKBOOK_ACCEPT,
  SELLPIA_WORKBOOK_FORMAT_LABEL,
  type SellpiaCandidateResolutionInput,
  type SellpiaNewProductCandidate,
  type SellpiaSnapshotImportResponse,
  type SellpiaStockSnapshotItem,
} from '@kiditem/shared/inventory';

type CandidateAction = SellpiaCandidateResolutionInput['action'];

type CandidateForm = {
  action: CandidateAction;
  masterName: string;
  masterProductId: string;
  optionName: string;
  barcode: string;
  productOptionId: string;
  operatorInitialStock: string;
  note: string;
};

type RowReviewForm = {
  targetCurrentStock: string;
  reason: string;
};

const actionLabels: Record<CandidateAction, string> = {
  create_product: '새 상품',
  create_option: '기존 상품 옵션',
  link_option: '기존 옵션 연결',
  ignore: '무시',
};

const SELLPIA_WORKBOOK_INPUT_LABEL = `Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL}`;
const SELLPIA_REVIEW_PAGE_SIZE = 50;

function defaultExportedAt(): string {
  return new Date().toISOString().slice(0, 16);
}

function toIsoFromDatetimeLocal(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function cleanOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toStock(value: string, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function candidateDefaults(candidate: SellpiaNewProductCandidate): CandidateForm {
  return {
    action: 'create_product',
    masterName: candidate.sellpiaProductName ?? candidate.sellpiaProductCode,
    masterProductId: '',
    optionName: candidate.sellpiaProductName ?? '',
    barcode: candidate.barcode ?? '',
    productOptionId: '',
    operatorInitialStock: String(candidate.sellpiaStock),
    note: '',
  };
}

function rowReviewDefaults(item: SellpiaStockSnapshotItem): RowReviewForm {
  return {
    targetCurrentStock: String(item.targetCurrentStock),
    reason: item.reviewNote ?? '',
  };
}

export default function SellpiaSync() {
  const [file, setFile] = useState<File | null>(null);
  const [effectiveExportedAt, setEffectiveExportedAt] = useState(defaultExportedAt);
  const [result, setResult] = useState<SellpiaSnapshotImportResponse | null>(null);
  const [filter, setFilter] = useState<SellpiaReviewFilter>('all');
  const [rowForms, setRowForms] = useState<Record<string, RowReviewForm>>({});
  const [candidateForms, setCandidateForms] = useState<Record<string, CandidateForm>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [reviewPage, setReviewPage] = useState(1);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectPageCheckboxRef = useRef<HTMLInputElement | null>(null);

  const actionableRows = useMemo(
    () => result?.items.filter((item) =>
      item.status === 'needs_review' ||
      item.status === 'new_product_candidate' ||
      item.status === 'missing_inventory' ||
      item.status === 'rejected' ||
      item.status === 'approved_adjusted' ||
      item.status === 'manual_adjusted' ||
      item.status === 'ignored',
    ) ?? [],
    [result],
  );
  const reviewMetricCount = result?.summary.reviewCount ?? 0;

  const reviewRows = useMemo(
    () => filterSellpiaRows(actionableRows, filter),
    [actionableRows, filter],
  );

  const reviewTotalPages = Math.max(1, Math.ceil(reviewRows.length / SELLPIA_REVIEW_PAGE_SIZE));
  const currentReviewPage = Math.min(reviewPage, reviewTotalPages);
  const reviewStartIndex = reviewRows.length === 0
    ? 0
    : (currentReviewPage - 1) * SELLPIA_REVIEW_PAGE_SIZE;
  const reviewEndIndex = Math.min(reviewStartIndex + SELLPIA_REVIEW_PAGE_SIZE, reviewRows.length);
  const pagedReviewRows = useMemo(
    () => reviewRows.slice(reviewStartIndex, reviewEndIndex),
    [reviewEndIndex, reviewRows, reviewStartIndex],
  );
  const pagedSelectedCount = pagedReviewRows.filter((item) => selectedIds.has(item.id)).length;
  const allPagedRowsSelected = pagedReviewRows.length > 0 && pagedSelectedCount === pagedReviewRows.length;
  const somePagedRowsSelected = pagedSelectedCount > 0 && !allPagedRowsSelected;
  const showCandidateEditors = filter === 'candidate';
  const showReviewTable = !showCandidateEditors;
  const pagedCandidateItemIds = useMemo(
    () => new Set(pagedReviewRows.map((item) => item.id)),
    [pagedReviewRows],
  );
  const visibleNewProductCandidates = useMemo(
    () => showCandidateEditors
      ? result?.newProductCandidates.filter((candidate) => pagedCandidateItemIds.has(candidate.snapshotItemId)) ?? []
      : [],
    [pagedCandidateItemIds, result, showCandidateEditors],
  );

  const selectedRows = useMemo(
    () => actionableRows.filter((item) => selectedIds.has(item.id)),
    [actionableRows, selectedIds],
  );

  const bulkApprovableRows = useMemo(
    () => selectedRows.filter((item) => {
      const form = rowForms[item.id] ?? rowReviewDefaults(item);
      return canBulkApproveSellpiaRow(
        item,
        toStock(form.targetCurrentStock, item.targetCurrentStock),
        form.reason,
      );
    }),
    [rowForms, selectedRows],
  );

  const bulkSkippedRows = useMemo(
    () => selectedRows.filter((item) => {
      const form = rowForms[item.id] ?? rowReviewDefaults(item);
      return !canBulkApproveSellpiaRow(
        item,
        toStock(form.targetCurrentStock, item.targetCurrentStock),
        form.reason,
      );
    }),
    [rowForms, selectedRows],
  );

  const bulkSkippedRowsWithReasons = useMemo(
    () => bulkSkippedRows.map((item) => {
      const form = rowForms[item.id] ?? rowReviewDefaults(item);
      return {
        item,
        reason: getSellpiaBulkApprovalBlockReason(
          item,
          toStock(form.targetCurrentStock, item.targetCurrentStock),
          form.reason,
        ) ?? '승인 불가',
      };
    }),
    [bulkSkippedRows, rowForms],
  );

  useEffect(() => {
    if (!selectPageCheckboxRef.current) return;
    selectPageCheckboxRef.current.indeterminate = somePagedRowsSelected;
  }, [somePagedRowsSelected]);

  function toggleSelected(itemId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  function toggleCurrentPageSelected(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of pagedReviewRows) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  function changeFilter(nextFilter: SellpiaReviewFilter) {
    setFilter(nextFilter);
    setReviewPage(1);
  }

  async function preview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setBulkMessage(null);
    try {
      const imported = await importSellpiaInventoryFile(file, toIsoFromDatetimeLocal(effectiveExportedAt));
      setResult(imported);
      setSelectedIds(new Set());
      setReviewPage(1);
      setRowForms(Object.fromEntries(imported.items.map((item) => [item.id, rowReviewDefaults(item)])));
      setCandidateForms(Object.fromEntries(
        imported.newProductCandidates.map((candidate) => [candidate.id, candidateDefaults(candidate)]),
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sellpia import failed');
    } finally {
      setLoading(false);
    }
  }

  async function approveSelected() {
    if (bulkApprovableRows.length === 0) return;
    const approvalRequests = bulkApprovableRows.map((item) => {
      const form = rowForms[item.id] ?? rowReviewDefaults(item);
      return {
        item,
        targetCurrentStock: toStock(form.targetCurrentStock, item.targetCurrentStock),
        reason: cleanOptional(form.reason),
      };
    });
    setBusyId('bulk');
    setError(null);
    setBulkMessage(null);
    try {
      const results = await approveSellpiaSnapshotItems(approvalRequests.map((request) => ({
        itemId: request.item.id,
        targetCurrentStock: request.targetCurrentStock,
        reason: request.reason,
      })));
      const successIds = new Set(results.filter((row) => row.ok).map((row) => row.itemId));
      const approvedById = new Map(approvalRequests.map((request) => [request.item.id, request]));
      setResult((prev) => prev ? {
        ...prev,
        items: prev.items.map((row) => {
          if (!successIds.has(row.id)) return row;
          const approved = approvedById.get(row.id);
          const targetCurrentStock = approved?.targetCurrentStock ?? row.targetCurrentStock;
          return {
            ...row,
            status: targetCurrentStock === row.targetCurrentStock ? 'approved_adjusted' : 'manual_adjusted',
            operatorTargetStock: targetCurrentStock,
            reviewNote: approved?.reason ?? null,
          };
        }),
      } : prev);
      setSelectedIds((prev) => new Set([...prev].filter((id) => !successIds.has(id))));
      setBulkMessage(
        `선택 처리 완료 승인 ${results.filter((row) => row.ok).length}건 · 실패 ${results.filter((row) => !row.ok).length}건 · 제외 ${bulkSkippedRows.length}건`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '선택 승인 실패');
    } finally {
      setBusyId(null);
    }
  }

  async function ignoreSelected() {
    const rows = selectedRows.filter((item) => item.status !== 'approved_adjusted' && item.status !== 'manual_adjusted');
    if (rows.length === 0) return;
    setBusyId('bulk');
    setError(null);
    setBulkMessage(null);
    try {
      const results = await ignoreSellpiaSnapshotItems(rows.map((item) => ({
        itemId: item.id,
        reason: cleanOptional((rowForms[item.id] ?? rowReviewDefaults(item)).reason),
      })));
      const successIds = new Set(results.filter((row) => row.ok).map((row) => row.itemId));
      setResult((prev) => prev ? {
        ...prev,
        items: prev.items.map((row) => successIds.has(row.id) ? { ...row, status: 'ignored' } : row),
      } : prev);
      setSelectedIds((prev) => new Set([...prev].filter((id) => !successIds.has(id))));
      setBulkMessage(`선택 제외 완료 ${results.filter((row) => row.ok).length}건 · 실패 ${results.filter((row) => !row.ok).length}건`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '선택 제외 실패');
    } finally {
      setBusyId(null);
    }
  }

  async function approve(item: SellpiaStockSnapshotItem) {
    const form = rowForms[item.id] ?? rowReviewDefaults(item);
    const targetCurrentStock = toStock(form.targetCurrentStock, item.targetCurrentStock);
    setBusyId(item.id);
    setError(null);
    try {
      await approveSellpiaSnapshotItem(item.id, {
        targetCurrentStock,
        reason: cleanOptional(form.reason),
      });
      setResult((prev) => prev ? {
        ...prev,
        items: prev.items.map((row) => row.id === item.id ? {
          ...row,
          status: targetCurrentStock === row.targetCurrentStock ? 'approved_adjusted' : 'manual_adjusted',
          operatorTargetStock: targetCurrentStock,
          reviewNote: cleanOptional(form.reason) ?? null,
        } : row),
      } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sellpia approval failed');
    } finally {
      setBusyId(null);
    }
  }

  async function ignore(item: SellpiaStockSnapshotItem) {
    const form = rowForms[item.id] ?? rowReviewDefaults(item);
    setBusyId(item.id);
    setError(null);
    try {
      await ignoreSellpiaItem(item.id, { reason: cleanOptional(form.reason) });
      setResult((prev) => prev ? {
        ...prev,
        items: prev.items.map((row) => row.id === item.id ? {
          ...row,
          status: 'ignored',
          reviewNote: cleanOptional(form.reason) ?? null,
        } : row),
      } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sellpia ignore failed');
    } finally {
      setBusyId(null);
    }
  }

  async function resolveCandidateRow(candidate: SellpiaNewProductCandidate) {
    const form = candidateForms[candidate.id] ?? candidateDefaults(candidate);
    const payload = buildCandidatePayload(form);
    setBusyId(candidate.id);
    setError(null);
    try {
      const resolved = await resolveSellpiaCandidate(candidate.id, payload);
      setResult((prev) => prev ? {
        ...prev,
        newProductCandidates: prev.newProductCandidates.map((row) =>
          row.id === candidate.id ? resolved : row,
        ),
      } : prev);
      setCandidateForms((prev) => ({ ...prev, [candidate.id]: { ...form, note: '' } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sellpia candidate resolution failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_auto] md:items-end">
          <label className="block text-sm font-medium text-slate-700">
            {SELLPIA_WORKBOOK_INPUT_LABEL}
            <input
              aria-label={SELLPIA_WORKBOOK_INPUT_LABEL}
              type="file"
              accept={SELLPIA_WORKBOOK_ACCEPT}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Export time
            <input
              type="datetime-local"
              value={effectiveExportedAt}
              onChange={(event) => setEffectiveExportedAt(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void preview()}
            disabled={!file || loading}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800',
              (!file || loading) && 'pointer-events-none opacity-60',
            )}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            미리보기
          </button>
        </div>
        {file ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <FileSpreadsheet size={14} />
            <span>{file.name}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {result ? (
        <>
          <div className="grid gap-3 text-sm md:grid-cols-5">
            <Metric label="상품 수" value={`${formatNumber(result.snapshot.rowCount)}개`} />
            <Metric label="일치" value={formatNumber(result.summary.matchedCount)} />
            <Metric label="검토" value={formatNumber(reviewMetricCount)} />
            <Metric label="거부" value={formatNumber(result.summary.rejectedCount)} />
            <Metric label="신규 상품 후보" value={`신규 상품 후보 ${formatNumber(result.summary.newProductCandidateCount)}`} />
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
              Sellpia 재고 검토
            </div>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
              {[
                ['all', '전체'],
                ['review', '검토'],
                ['candidate', '신규 후보'],
                ['rejected', '거부'],
                ['done', '완료'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeFilter(value as SellpiaReviewFilter)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium',
                    filter === value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {label} {formatNumber(getSellpiaFilterCount(actionableRows, value as SellpiaReviewFilter))}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
              <div className="text-xs font-medium text-slate-500">선택 {formatNumber(selectedRows.length)}건</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void approveSelected()}
                  disabled={busyId !== null || bulkApprovableRows.length === 0}
                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  선택 승인
                </button>
                <button
                  type="button"
                  onClick={() => void ignoreSelected()}
                  disabled={busyId !== null || selectedRows.length === 0}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 disabled:opacity-50"
                >
                  선택 무시
                </button>
              </div>
            </div>
            {bulkMessage ? (
              <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800">
                {bulkMessage}
              </div>
            ) : null}
            {bulkSkippedRowsWithReasons.length > 0 ? (
              <div className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">
                선택 상품 중 {formatNumber(bulkSkippedRowsWithReasons.length)}건은 사유 누락 또는 차단 사유 때문에 승인에서 제외됩니다.
                <ul className="mt-1 list-disc pl-4">
                  {bulkSkippedRowsWithReasons.map(({ item, reason }) => (
                    <li key={item.id}>{item.sellpiaProductCode}: {reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {reviewRows.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-600">
                <div className="font-semibold tabular-nums text-slate-700">
                  {formatNumber(reviewStartIndex + 1)}-{formatNumber(reviewEndIndex)} / {formatNumber(reviewRows.length)}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="이전 페이지"
                    onClick={() => setReviewPage((page) => Math.max(1, page - 1))}
                    disabled={busyId !== null || currentReviewPage <= 1}
                    className="rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-600 disabled:opacity-50"
                  >
                    이전 페이지
                  </button>
                  <span className="rounded-md bg-white px-2.5 py-1 font-medium tabular-nums text-slate-700">
                    {formatNumber(currentReviewPage)} / {formatNumber(reviewTotalPages)}
                  </span>
                  <button
                    type="button"
                    aria-label="다음 페이지"
                    onClick={() => setReviewPage((page) => Math.min(reviewTotalPages, page + 1))}
                    disabled={busyId !== null || currentReviewPage >= reviewTotalPages}
                    className="rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-600 disabled:opacity-50"
                  >
                    다음 페이지
                  </button>
                </div>
              </div>
            ) : null}
            {showCandidateEditors ? (
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="mb-3 text-sm font-semibold text-slate-900">신규 상품 후보 처리</div>
                <div className="space-y-3">
                  {visibleNewProductCandidates.length === 0 ? (
                    <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
                      신규 상품 후보가 없습니다.
                    </div>
                  ) : visibleNewProductCandidates.map((candidate) => (
                    <CandidateEditor
                      key={candidate.id}
                      candidate={candidate}
                      form={candidateForms[candidate.id] ?? candidateDefaults(candidate)}
                      busy={busyId === candidate.id}
                      disabled={busyId !== null || candidate.status !== 'pending'}
                      onChange={(form) => setCandidateForms((prev) => ({ ...prev, [candidate.id]: form }))}
                      onSubmit={() => void resolveCandidateRow(candidate)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {showReviewTable ? (
              <div className="overflow-hidden">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[6%]" />
                    <col className="w-[11%]" />
                    <col className="w-[24%]" />
                    <col className="w-[9%]" />
                    <col className="w-[14%]" />
                    <col className="w-[19%]" />
                    <col className="w-[17%]" />
                  </colgroup>
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-2 py-2 text-left">
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            ref={selectPageCheckboxRef}
                            aria-label="현재 페이지 모두 선택"
                            type="checkbox"
                            checked={allPagedRowsSelected}
                            onChange={(event) => toggleCurrentPageSelected(event.target.checked)}
                            disabled={busyId !== null || pagedReviewRows.length === 0}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span>선택</span>
                        </label>
                      </th>
                      <th className="px-2 py-2 text-left">상품코드</th>
                      <th className="px-2 py-2 text-left">상품명</th>
                      <th className="px-2 py-2 text-right">Sellpia</th>
                      <th className="px-2 py-2 text-right">KidItem 목표</th>
                      <th className="px-2 py-2 text-left">메모</th>
                      <th className="px-2 py-2 text-right">처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                          검토할 상품이 없습니다.
                        </td>
                      </tr>
                    ) : pagedReviewRows.map((item) => {
                    const form = rowForms[item.id] ?? rowReviewDefaults(item);
                    const targetCurrentStock = toStock(form.targetCurrentStock, item.targetCurrentStock);
                    const reasonRequired = requiresSellpiaRowReason(item, targetCurrentStock);
                    const approveDisabled =
                      busyId !== null ||
                      !item.inventoryId ||
                      (reasonRequired && !form.reason.trim());
                    return (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-2 py-2">
                          <input
                            aria-label={`select-${item.id}`}
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={(event) => toggleSelected(item.id, event.target.checked)}
                            disabled={busyId !== null}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="truncate px-2 py-2 font-mono text-xs text-slate-500">{item.sellpiaProductCode}</td>
                        <td className="px-2 py-2 text-slate-700 whitespace-normal">
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="truncate">{item.sellpiaProductName ?? '-'}</span>
                            <div className="flex flex-wrap gap-1">
                              {getSellpiaRowBadges(item).map((badge) => (
                                <span
                                  key={`${badge.tone}-${badge.label}`}
                                  className={cn(
                                    'rounded px-1.5 py-0.5 text-[11px] font-medium',
                                    badge.tone === 'danger' && 'bg-red-50 text-red-700',
                                    badge.tone === 'warning' && 'bg-amber-50 text-amber-700',
                                    badge.tone === 'success' && 'bg-emerald-50 text-emerald-700',
                                    badge.tone === 'neutral' && 'bg-slate-100 text-slate-600',
                                  )}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatNumber(item.sellpiaStock)}</td>
                        <td className="px-2 py-2 text-right">
                          <input
                            aria-label={`target-${item.id}`}
                            type="number"
                            min={0}
                            value={form.targetCurrentStock}
                            onChange={(event) => setRowForms((prev) => ({
                              ...prev,
                              [item.id]: { ...form, targetCurrentStock: event.target.value },
                            }))}
                            className="w-full min-w-0 rounded-md border border-slate-200 px-2 py-1 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            aria-label={`reason-${item.id}`}
                            value={form.reason}
                            onChange={(event) => setRowForms((prev) => ({
                              ...prev,
                              [item.id]: { ...form, reason: event.target.value },
                            }))}
                            className="w-full min-w-0 rounded-md border border-slate-200 px-2 py-1"
                          />
                          {reasonRequired && !form.reason.trim() ? (
                            <div className="mt-1 text-[11px] text-amber-700">사유 입력 후 승인할 수 있습니다.</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => void approve(item)}
                              disabled={approveDisabled}
                              className="inline-flex h-8 min-w-[52px] items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 text-xs font-medium text-white disabled:opacity-50"
                            >
                              {busyId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                              승인
                            </button>
                            <button
                              type="button"
                              onClick={() => void ignore(item)}
                              disabled={busyId !== null}
                              className="inline-flex h-8 min-w-[52px] items-center justify-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-600 disabled:opacity-50"
                            >
                              <X size={13} />
                              무시
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function CandidateEditor({
  candidate,
  form,
  busy,
  disabled,
  onChange,
  onSubmit,
}: {
  candidate: SellpiaNewProductCandidate;
  form: CandidateForm;
  busy: boolean;
  disabled: boolean;
  onChange: (form: CandidateForm) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-slate-500">{candidate.sellpiaProductCode}</div>
          <div className="truncate text-sm font-medium text-slate-900">{candidate.sellpiaProductName ?? '-'}</div>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {candidate.status}
        </span>
      </div>
      <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-4">
        <label className="min-w-0 text-xs font-medium text-slate-600">
          후보 처리
          <select
            value={form.action}
            onChange={(event) => onChange({ ...form, action: event.target.value as CandidateAction })}
            className="mt-1 w-full min-w-0 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            disabled={disabled}
          >
            {Object.entries(actionLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {form.action === 'create_product' ? (
          <TextField label="상품명" value={form.masterName} disabled={disabled} onChange={(masterName) => onChange({ ...form, masterName })} />
        ) : null}
        {form.action === 'create_option' ? (
          <TextField label="상품 ID" value={form.masterProductId} disabled={disabled} onChange={(masterProductId) => onChange({ ...form, masterProductId })} />
        ) : null}
        {form.action === 'link_option' ? (
          <TextField label="옵션 ID" value={form.productOptionId} disabled={disabled} onChange={(productOptionId) => onChange({ ...form, productOptionId })} />
        ) : null}
        {form.action === 'create_product' || form.action === 'create_option' ? (
          <>
            <TextField label="옵션명" value={form.optionName} disabled={disabled} onChange={(optionName) => onChange({ ...form, optionName })} />
            <TextField label="바코드" value={form.barcode} disabled={disabled} onChange={(barcode) => onChange({ ...form, barcode })} />
          </>
        ) : null}
        {form.action !== 'ignore' ? (
          <TextField
            label="초기재고"
            type="number"
            value={form.operatorInitialStock}
            disabled={disabled}
            onChange={(operatorInitialStock) => onChange({ ...form, operatorInitialStock })}
          />
        ) : null}
        <TextField label="메모" value={form.note} disabled={disabled} onChange={(note) => onChange({ ...form, note })} />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          후보 적용
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: 'text' | 'number';
}) {
  return (
    <label className="min-w-0 text-xs font-medium text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        disabled={disabled}
        min={type === 'number' ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full min-w-0 rounded-md border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
      />
    </label>
  );
}

function buildCandidatePayload(form: CandidateForm): SellpiaCandidateResolutionInput {
  const note = cleanOptional(form.note);
  if (form.action === 'ignore') return { action: 'ignore', note };
  const operatorInitialStock = toStock(form.operatorInitialStock);
  if (form.action === 'create_product') {
    return {
      action: 'create_product',
      masterName: form.masterName.trim(),
      optionName: cleanOptional(form.optionName) ?? null,
      barcode: cleanOptional(form.barcode) ?? null,
      operatorInitialStock,
      note,
    };
  }
  if (form.action === 'create_option') {
    return {
      action: 'create_option',
      masterProductId: form.masterProductId.trim(),
      optionName: cleanOptional(form.optionName) ?? null,
      barcode: cleanOptional(form.barcode) ?? null,
      operatorInitialStock,
      note,
    };
  }
  return {
    action: 'link_option',
    productOptionId: form.productOptionId.trim(),
    operatorInitialStock,
    note,
  };
}
