'use client';

import { useState } from 'react';
import { SELLPIA_WORKBOOK_ACCEPT } from '@kiditem/shared/inventory';
import { Loader2, Upload } from 'lucide-react';

export function SellpiaManualImportForm({
  onSubmit,
}: {
  onSubmit: (file: File, manualFreshExportConfirmed: true) => Promise<unknown>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file || !confirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(file, true);
      setFile(null);
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '수동 파일을 가져오지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <h3 className="font-semibold text-[var(--text-primary)]">수동 파일 가져오기</h3>
      <p className="text-sm text-[var(--text-secondary)]">
        자동 수집을 사용할 수 없을 때 방금 Sellpia에서 내보낸 재고 파일만 올려주세요.
      </p>
      <input
        aria-label="Sellpia 재고 파일"
        type="file"
        accept={SELLPIA_WORKBOOK_ACCEPT}
        disabled={submitting}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        className="block w-full text-sm text-[var(--text-secondary)]"
      />
      <label className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={submitting}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        이 파일이 방금 Sellpia에서 내보낸 최신 재고 파일임을 확인합니다.
      </label>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!file || !confirmed || submitting}
        className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}
        수동 파일 가져오기
      </button>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
