'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SabangnetImportPreview } from '@kiditem/shared/sales-product';
import { isApiError } from '@/lib/api-error';
import { salesProductApi, salesProductKeys } from '../lib/sales-product-api';

const KIND_LABEL: Record<SabangnetImportPreview['files'][number]['kind'], string> = {
  products: '상품(사방넷상품대량수정)',
  options: '단품(사방넷단품대량수정)',
  channel_overrides: '몰별 값(쇼핑몰별별도정보관리)',
};

/**
 * 사방넷에서 내려받은 엑셀을 그대로 올린다. 먼저 미리보기로 무엇이 바뀌는지 보고, 같은 파일로 옮긴다 —
 * 판매상품코드(사방넷 품번)로 찾아 덮어써서 두 번 올려도 결과가 같다.
 */
export function SabangnetImportDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<SabangnetImportPreview | null>(null);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => salesProductApi.importSabangnet(files, dryRun),
    onSuccess: (result) => {
      setPreview(result);
      if (!result.dryRun) {
        toast.success(`옮겼습니다 — 새로 ${result.products.created} · 고침 ${result.products.updated} · 그대로 ${result.products.unchanged}`);
        void queryClient.invalidateQueries({ queryKey: salesProductKeys.all });
      }
    },
    onError: (error) => {
      toast.error(isApiError(error) ? error.detail : '사방넷 엑셀을 읽지 못했습니다.');
    },
  });

  const pick = (list: FileList | null) => {
    setFiles(list ? [...list].slice(0, 3) : []);
    setPreview(null);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="사방넷 엑셀 가져오기">
      <div className="w-[640px] max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">사방넷 엑셀 가져오기</h2>
            <p className="mt-1 text-sm text-slate-500">
              사방넷 <b>상품대량수정</b> 수정파일은 꼭, <b>단품대량수정</b> · <b>쇼핑몰별별도정보관리</b> 수정파일은 함께 올리면
              옵션과 몰별 값까지 옮깁니다. 같은 파일을 다시 올려도 바뀐 것만 고칩니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 hover:border-purple-300">
          <Upload size={20} aria-hidden />
          <span>엑셀 파일 고르기(.xlsx, 3개까지)</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="sr-only"
            onChange={(event) => pick(event.target.files)}
          />
        </label>
        {files.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {files.map((file) => (
              <li key={file.name} className="flex items-center gap-2">
                <FileSpreadsheet size={14} className="text-emerald-600" aria-hidden />
                {file.name}
              </li>
            ))}
          </ul>
        )}

        {preview && <ImportPreview preview={preview} />}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>닫기</button>
          <button
            type="button"
            className="btn-secondary"
            disabled={files.length === 0 || run.isPending}
            onClick={() => run.mutate(true)}
          >
            {run.isPending && run.variables === true ? '읽는 중…' : '미리보기'}
          </button>
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            disabled={!preview?.dryRun || run.isPending}
            onClick={() => run.mutate(false)}
          >
            {run.isPending && run.variables === false ? '옮기는 중…' : '옮기기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportPreview({ preview }: { preview: SabangnetImportPreview }) {
  const skipped = Object.entries(preview.channelOverrides.skippedByShop);
  return (
    <section aria-label={preview.dryRun ? '미리보기' : '옮긴 결과'} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-slate-800">{preview.dryRun ? '옮기면 이렇게 됩니다' : '옮겼습니다'}</p>
      <ul className="mt-2 space-y-1 text-slate-700">
        {preview.files.map((file) => (
          <li key={file.name}>{KIND_LABEL[file.kind]}: {file.rows.toLocaleString()}줄</li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-slate-700">
        <dt>판매상품</dt>
        <dd className="tabular-nums">
          {preview.products.total.toLocaleString()}개 (새로 {preview.products.created} · 고침 {preview.products.updated} · 그대로 {preview.products.unchanged})
        </dd>
        <dt>옵션(단품)</dt>
        <dd className="tabular-nums">
          {preview.options.total.toLocaleString()}줄 · 옵션 상품 {preview.options.withOptionsProducts}개
        </dd>
        <dt>셀피아 연결</dt>
        <dd className="tabular-nums">
          {preview.options.linked.toLocaleString()}줄 연결 · {preview.options.unlinked.toLocaleString()}줄은 화면에서 골라야 함
        </dd>
        <dt>몰별 값</dt>
        <dd className="tabular-nums">
          {preview.channelOverrides.saved.toLocaleString()}줄 / {preview.channelOverrides.total.toLocaleString()}줄
        </dd>
      </dl>
      {skipped.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          우리 몰 계정이 없어 넘긴 몰: {skipped.map(([shop, count]) => `${shop} ${count}줄`).join(' · ')}
        </p>
      )}
      {preview.issueCount > 0 && (
        <details className="mt-2 text-xs text-amber-800">
          <summary>확인할 줄 {preview.issueCount}개</summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {preview.issues.map((issue) => (
              <li key={`${issue.kind}-${issue.row}-${issue.code}`}>{issue.row}행 {issue.code ?? ''} — {issue.message}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
