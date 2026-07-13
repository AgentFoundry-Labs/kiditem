'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { SELLPIA_WORKBOOK_ACCEPT } from '@kiditem/shared/inventory';
import { formatNumber } from '@/lib/utils';
import { importSellpiaInventory } from '../lib/sellpia-inventory-import-api';
import { invalidateSellpiaInventory } from '../../_shared/invalidate-sellpia-inventory';
import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';

export const SELLPIA_INVENTORY_FILE_ACCEPT = [
  SELLPIA_WORKBOOK_ACCEPT,
  'text/csv',
  'text/plain',
  'text/tab-separated-values',
].join(',');

type ImportCounterProps = {
  label: string;
  value: number;
};

function ImportCounter({ label, value }: ImportCounterProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
        {formatNumber(value)}
      </p>
    </div>
  );
}

export default function SellpiaInventoryImport() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SellpiaInventoryImportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importInventory() {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await importSellpiaInventory(file);
      await invalidateSellpiaInventory(queryClient);
      setResult(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sellpia 재고를 가져오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[var(--primary-soft)] p-2 text-[var(--primary)]">
            <FileSpreadsheet aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Sellpia 재고 가져오기
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Sellpia 재고를 보고 재고로 그대로 복사하며, KidItem에서는 수량을 조정하지 않습니다.
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              상품 매칭 상태는 다음에 상품 매칭 센터를 열 때 최신 재고 기준으로 조회됩니다.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block min-w-0 text-sm font-medium text-[var(--text-primary)]">
            Sellpia 재고 파일
            <input
              type="file"
              accept={SELLPIA_INVENTORY_FILE_ACCEPT}
              disabled={loading}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
                setError(null);
              }}
              className="mt-2 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--primary-soft)] file:px-3 file:py-1.5 file:font-medium file:text-[var(--primary)]"
            />
          </label>
          <button
            type="button"
            disabled={!file || loading}
            onClick={importInventory}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Upload aria-hidden="true" className="h-4 w-4" />
            )}
            {loading ? '가져오는 중...' : '재고 가져오기'}
          </button>
        </div>

        {file ? (
          <p className="mt-3 truncate text-sm text-[var(--text-secondary)]">{file.name}</p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}
      </div>

      {result ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold">가져오기 완료</h3>
          </div>

          {result.duplicate ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              이미 가져온 동일 파일입니다
            </p>
          ) : null}

          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-[var(--text-secondary)]">상태</dt>
              <dd className="mt-1 font-medium text-[var(--text-primary)]">완료</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--text-secondary)]">가져온 행</dt>
              <dd className="mt-1 font-medium text-[var(--text-primary)]">
                {formatNumber(result.run.rowCount)}
              </dd>
            </div>
          </dl>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <ImportCounter label="새로 생성" value={result.changes.createdMasterProductCount} />
            <ImportCounter label="업데이트" value={result.changes.updatedMasterProductCount} />
            <ImportCounter label="비활성 전환" value={result.changes.inactivatedMasterProductCount} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
