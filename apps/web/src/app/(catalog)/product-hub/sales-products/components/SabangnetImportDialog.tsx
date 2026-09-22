'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import type {
  SabangnetImportPreview,
  SabangnetImportSelection,
  SalesProductLinkResult,
} from '@kiditem/shared/sales-product';

const KIND_LABEL: Record<SabangnetImportPreview['files'][number]['kind'], string> = {
  products: '상품(사방넷상품대량수정)',
  options: '단품(사방넷단품대량수정)',
  channel_overrides: '몰별 값(쇼핑몰별별도정보관리)',
  send_records: '송신 기록(쇼핑몰상품수정 다운로드)',
  mall_categories: '몰 분류(쇼핑몰카테고리)',
  mall_templates: '몰 부가정보(쇼핑몰부가정보)',
};

const LINK_SOURCE_LABEL: Record<keyof SalesProductLinkResult['bySource'], string> = {
  sabangnet_record: '사방넷 기록',
  send_record_file: '송신 기록 파일',
  seller_code: '판매자 상품코드',
};

const MAX_FILES = 6;

interface ImportRun {
  dryRun: boolean;
  selections: SabangnetImportSelection;
}

/**
 * 사방넷에서 내려받은 엑셀을 그대로 올린다. 먼저 미리보기로 무엇이 바뀌는지 보고, 같은 파일로 옮긴다 —
 * 판매상품코드(사방넷 품번)로 찾아 덮어써서 두 번 올려도 결과가 같다.
 */
export function SabangnetImportDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<SabangnetImportPreview | null>(null);
  const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);

  const run = useMutation({
    mutationFn: ({ dryRun, selections }: ImportRun) => salesProductApi.importSabangnet(files, dryRun, selections),
    onSuccess: (result) => {
      setPreview(result);
      if (result.dryRun) setSelectedExistingIds([]);
      if (!result.dryRun) {
        toast.success(result.products.total > 0
          ? `옮겼습니다 — 새로 ${result.products.created} · 고침 ${result.products.updated} · 그대로 ${result.products.unchanged}`
          : `몰 상품 ${result.links?.linkedListings ?? 0}개를 판매상품과 이었습니다`);
        void queryClient.invalidateQueries({ queryKey: salesProductKeys.all });
      }
    },
    onError: (error) => {
      toast.error(isApiError(error) ? error.detail : '사방넷 엑셀을 읽지 못했습니다.');
    },
  });

  const pick = (list: FileList | null) => {
    setFiles(list ? [...list].slice(0, MAX_FILES) : []);
    setPreview(null);
    setSelectedExistingIds([]);
  };

  const selections: SabangnetImportSelection = preview?.existingChanges
    .filter((change) => selectedExistingIds.includes(change.salesProductId))
    .map(({ salesProductId, expectedVersion }) => ({ salesProductId, expectedVersion })) ?? [];

  const toggleExisting = (salesProductId: string, checked: boolean) => {
    setSelectedExistingIds((current) => checked
      ? current.includes(salesProductId) ? current : [...current, salesProductId]
      : current.filter((id) => id !== salesProductId));
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="사방넷 엑셀 가져오기">
      <div className="w-[640px] max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">사방넷 엑셀 가져오기</h2>
            <p className="mt-1 text-sm text-slate-500">
              사방넷 <b>상품대량수정</b> 수정파일(쓰시던 <b>대량등록</b> 양식도 됩니다)에 <b>단품대량수정</b> ·
              <b>쇼핑몰별별도정보관리</b>를 함께 올리면 옵션과 몰별 값까지 옮깁니다. 자체상품코드가 같으면 같은 상품으로 고칩니다. <b>쇼핑몰상품수정</b> 다운로드를 더하면 몰에 올라간 상품도 판매상품과 잇고(그 파일만 올려도 됩니다),
              <b>쇼핑몰카테고리</b> · <b>쇼핑몰부가정보</b>까지 더하면 상품마다 몰에서 쓰던 분류와 부가정보를 남깁니다. 같은 파일을 다시 올려도 바뀐 것만 고칩니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 hover:border-purple-300">
          <Upload size={20} aria-hidden />
          <span>엑셀 파일 고르기(.xlsx, {MAX_FILES}개까지)</span>
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

        {preview && (
          <ImportPreview
            preview={preview}
            selectedExistingIds={selectedExistingIds}
            onToggleExisting={toggleExisting}
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>닫기</button>
          <button
            type="button"
            className="btn-secondary"
            disabled={files.length === 0 || run.isPending}
            onClick={() => run.mutate({ dryRun: true, selections: [] })}
          >
            {run.isPending && run.variables?.dryRun === true ? '읽는 중…' : '미리보기'}
          </button>
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            disabled={!preview?.dryRun || run.isPending}
            onClick={() => run.mutate({ dryRun: false, selections })}
          >
            {run.isPending && run.variables?.dryRun === false ? '옮기는 중…' : '옮기기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportPreview({
  preview,
  selectedExistingIds,
  onToggleExisting,
}: {
  preview: SabangnetImportPreview;
  selectedExistingIds: readonly string[];
  onToggleExisting: (salesProductId: string, checked: boolean) => void;
}) {
  const skipped = Object.entries(preview.channelOverrides.skippedByShop);
  const hasProducts = preview.files.some((file) => file.kind === 'products');
  return (
    <section aria-label={preview.dryRun ? '미리보기' : '옮긴 결과'} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-slate-800">{preview.dryRun ? '옮기면 이렇게 됩니다' : '옮겼습니다'}</p>
      <ul className="mt-2 space-y-1 text-slate-700">
        {preview.files.map((file) => (
          <li key={file.name}>{KIND_LABEL[file.kind]}: {file.rows.toLocaleString()}줄</li>
        ))}
      </ul>
      {hasProducts && (
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
      )}
      {preview.existingChanges.length > 0 && (
        <fieldset className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <legend className="px-1 font-semibold text-slate-800">기존 판매상품 고치기</legend>
          <p className="mb-2 text-xs text-slate-500">
            기본값은 기존 상품을 그대로 둡니다. 고칠 상품만 고르세요. 미리보기 버전이 달라지면 다시 미리보기가 필요합니다.
          </p>
          <ul className="space-y-2">
            {preview.existingChanges.map((change) => {
              const checked = selectedExistingIds.includes(change.salesProductId);
              return (
                <li key={change.salesProductId} className="rounded-md border border-slate-100 px-2 py-1.5">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      name="applyExisting"
                      checked={checked}
                      disabled={!preview.dryRun}
                      onChange={(event) => onToggleExisting(change.salesProductId, event.target.checked)}
                      aria-label={`${change.name} (${change.code}) 기존 상품 고치기`}
                      className="mt-0.5 size-4 accent-purple-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-800">{change.name}</span>
                      <span className="block text-xs text-slate-500">
                        {change.code} · 원천키 {change.sourceKey} · 버전 {change.expectedVersion}
                        {change.changed ? ' · 바뀐 내용 있음' : ' · 바뀐 내용 없음'}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      {preview.links && <LinkSummary links={preview.links} dryRun={preview.dryRun} />}
      {preview.mallValues && (
        <p className="mt-2 text-slate-700">
          몰별 분류 · 부가정보: 상품 × 몰 <span className="tabular-nums">{preview.mallValues.pairs.toLocaleString()}</span>줄
          <span className="text-slate-500">
            {' '}(분류 {preview.mallValues.withCategory.toLocaleString()} · 부가정보 {preview.mallValues.withTemplate.toLocaleString()})
          </span>
        </p>
      )}
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

function LinkSummary({ links, dryRun }: { links: SalesProductLinkResult; dryRun: boolean }) {
  const sources = (Object.keys(LINK_SOURCE_LABEL) as (keyof SalesProductLinkResult['bySource'])[])
    .filter((source) => (links.bySource[source] ?? 0) > 0)
    .map((source) => `${LINK_SOURCE_LABEL[source]} ${links.bySource[source]!.toLocaleString()}`);
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-slate-200 pt-3 text-slate-700">
      <dt>몰 상품 잇기</dt>
      <dd className="tabular-nums">
        {links.linkedListings.toLocaleString()}개 {dryRun ? '이음' : '이었음'}
        {sources.length > 0 && <span className="text-slate-500"> ({sources.join(' · ')})</span>}
      </dd>
      <dt>이미 이어짐</dt>
      <dd className="tabular-nums">{links.alreadyLinked.toLocaleString()}개</dd>
      <dt>옵션 · 셀피아 구성</dt>
      <dd className="tabular-nums">
        옵션 {links.linkedOptions.toLocaleString()}개 · 빈 레시피 {links.recipesFilled.toLocaleString()}개 채움
      </dd>
      {links.conflicts > 0 && (
        <>
          <dt className="text-amber-800">근거가 엇갈림</dt>
          <dd className="tabular-nums text-amber-800">{links.conflicts.toLocaleString()}개는 잇지 않음</dd>
        </>
      )}
    </dl>
  );
}
