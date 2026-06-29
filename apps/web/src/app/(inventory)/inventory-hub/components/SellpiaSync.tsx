'use client';

import { useMemo, useState } from 'react';
import { Check, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  approveSellpiaSnapshotItem,
  ignoreSellpiaItem,
  importSellpiaInventoryFile,
  resolveSellpiaCandidate,
} from '../../_shared/inventory-api';
import type {
  SellpiaCandidateResolutionInput,
  SellpiaNewProductCandidate,
  SellpiaSnapshotImportResponse,
  SellpiaStockSnapshotItem,
} from '@kiditem/shared/inventory';

type CandidateAction = SellpiaCandidateResolutionInput['action'];

type CandidateForm = {
  action: CandidateAction;
  masterName: string;
  masterProductId: string;
  optionName: string;
  sku: string;
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
    sku: candidate.sellpiaProductCode,
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
  const [rowForms, setRowForms] = useState<Record<string, RowReviewForm>>({});
  const [candidateForms, setCandidateForms] = useState<Record<string, CandidateForm>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reviewRows = useMemo(
    () => result?.items.filter((item) =>
      item.status === 'recommended' ||
      item.status === 'needs_review' ||
      item.status === 'new_product_candidate' ||
      item.status === 'missing_inventory',
    ) ?? [],
    [result],
  );

  async function preview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const imported = await importSellpiaInventoryFile(file, toIsoFromDatetimeLocal(effectiveExportedAt));
      setResult(imported);
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
            Sellpia XLSX
            <input
              aria-label="Sellpia XLSX"
              type="file"
              accept=".xlsx,.xls"
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
            <Metric label="rows" value={`${formatNumber(result.snapshot.rowCount)} rows`} />
            <Metric label="추천" value={formatNumber(result.summary.recommendedCount)} />
            <Metric label="검토" value={formatNumber(result.summary.reviewCount)} />
            <Metric label="거부" value={formatNumber(result.summary.rejectedCount)} />
            <Metric label="신규 상품 후보" value={`신규 상품 후보 ${formatNumber(result.summary.newProductCandidateCount)}`} />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
              Sellpia row review
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">상품코드</th>
                    <th className="px-3 py-2 text-left">상품명</th>
                    <th className="px-3 py-2 text-right">Sellpia</th>
                    <th className="px-3 py-2 text-right">KidItem 목표</th>
                    <th className="px-3 py-2 text-left">메모</th>
                    <th className="px-3 py-2 text-right">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                        검토할 row가 없습니다.
                      </td>
                    </tr>
                  ) : reviewRows.map((item) => {
                    const form = rowForms[item.id] ?? rowReviewDefaults(item);
                    return (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{item.sellpiaProductCode}</td>
                        <td className="max-w-[260px] truncate px-3 py-2 text-slate-700">
                          {item.sellpiaProductName ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(item.sellpiaStock)}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            aria-label={`target-${item.id}`}
                            type="number"
                            min={0}
                            value={form.targetCurrentStock}
                            onChange={(event) => setRowForms((prev) => ({
                              ...prev,
                              [item.id]: { ...form, targetCurrentStock: event.target.value },
                            }))}
                            className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`reason-${item.id}`}
                            value={form.reason}
                            onChange={(event) => setRowForms((prev) => ({
                              ...prev,
                              [item.id]: { ...form, reason: event.target.value },
                            }))}
                            className="w-full min-w-[160px] rounded-md border border-slate-200 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => void approve(item)}
                              disabled={busyId !== null || !item.inventoryId}
                              className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-xs font-medium text-white disabled:opacity-50"
                            >
                              {busyId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                              승인
                            </button>
                            <button
                              type="button"
                              onClick={() => void ignore(item)}
                              disabled={busyId !== null}
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 disabled:opacity-50"
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
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 text-sm font-semibold text-slate-900">신규 상품 후보</div>
            <div className="space-y-3">
              {result.newProductCandidates.length === 0 ? (
                <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
                  신규 상품 후보가 없습니다.
                </div>
              ) : result.newProductCandidates.map((candidate) => (
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
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-slate-500">{candidate.sellpiaProductCode}</div>
          <div className="text-sm font-medium text-slate-900">{candidate.sellpiaProductName ?? '-'}</div>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {candidate.status}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">
          후보 처리
          <select
            value={form.action}
            onChange={(event) => onChange({ ...form, action: event.target.value as CandidateAction })}
            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
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
            <TextField label="SKU" value={form.sku} disabled={disabled} onChange={(sku) => onChange({ ...form, sku })} />
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
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        disabled={disabled}
        min={type === 'number' ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
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
      sku: form.sku.trim(),
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
      sku: form.sku.trim(),
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
