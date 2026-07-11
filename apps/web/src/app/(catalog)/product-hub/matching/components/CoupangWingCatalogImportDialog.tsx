'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FileSpreadsheet, Loader2, X } from 'lucide-react';
import { friendlyError } from '@/lib/api-error';
import { formatNumber } from '@/lib/utils';
import { useImportCoupangWingCatalog } from '../hooks/useChannelSkuMappings';
import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';
import type { ChannelAccountListItem } from '@kiditem/shared/channel-account';

type CoupangWingCatalogImportDialogProps = {
  open: boolean;
  account: ChannelAccountListItem | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (response: CoupangWingCatalogImportResponse) => void;
};

export function CoupangWingCatalogImportDialog({
  open,
  account,
  onOpenChange,
  onSuccess,
}: CoupangWingCatalogImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CoupangWingCatalogImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importMutation = useImportCoupangWingCatalog();

  const accountError = !account
    ? '쿠팡 Wing 계정을 먼저 선택해 주세요.'
    : account.channel !== 'coupang'
      ? 'channel이 coupang인 계정만 Wing 파일을 가져올 수 있습니다.'
      : null;

  const resetAndClose = () => {
    if (importMutation.isPending) return;
    setFile(null);
    setResult(null);
    setError(null);
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (!account || account.channel !== 'coupang' || !file) return;
    setError(null);
    setResult(null);
    try {
      const response = await importMutation.mutateAsync({
        channelAccountId: account.id,
        file,
      });
      setResult(response);
      onSuccess(response);
    } catch (uploadError) {
      setError(friendlyError(uploadError) ?? 'Wing 상품 파일을 가져오지 못했습니다.');
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetAndClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] w-[min(92vw,600px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)] shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border,#e2e8f0)] px-6 py-5">
            <div>
              <Dialog.Title className="text-lg font-bold text-[var(--text-primary,#0f172a)]">
                쿠팡 Wing 상품 가져오기
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary,#475569)]">
                {account ? `${account.name} 계정에 상품·옵션 SKU 메타데이터를 갱신합니다.` : '가져올 계정을 선택해 주세요.'}
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={resetAndClose}
              disabled={importMutation.isPending}
              className="rounded-lg p-2 text-[var(--text-tertiary,#64748b)] hover:bg-[var(--surface-sunken,#f1f5f9)] disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </header>

          <div className="space-y-5 px-6 py-5">
            <p className="rounded-xl bg-[var(--primary-soft,#f3f0ff)] px-4 py-3 text-sm text-[var(--text-secondary,#475569)]">
              이 파일은 쇼핑몰 상품 메타데이터만 갱신하며 기존 Sellpia 구성 매칭은 유지합니다.
            </p>

            {accountError ? (
              <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                {accountError}
              </p>
            ) : null}

            <label className="block space-y-2 text-sm font-semibold text-[var(--text-primary,#0f172a)]">
              <span>쿠팡 Wing 상품 파일</span>
              <input
                aria-label="쿠팡 Wing 상품 파일"
                type="file"
                accept=".xlsx,.xls"
                disabled={importMutation.isPending}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setResult(null);
                  setError(null);
                }}
                className="block w-full rounded-xl border border-[var(--border,#cbd5e1)] bg-[var(--surface-sunken,#f8fafc)] p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary,#7048e8)] file:px-3 file:py-2 file:font-semibold file:text-white"
              />
            </label>

            {file ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border,#e2e8f0)] px-4 py-3 text-sm text-[var(--text-secondary,#475569)]">
                <FileSpreadsheet size={17} className="text-emerald-600" />
                <span className="truncate">{file.name}</span>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            ) : null}

            {result ? (
              <section aria-label="Wing 가져오기 결과" className="space-y-3 rounded-xl border border-[var(--border,#e2e8f0)] p-4">
                {result.duplicate ? (
                  <p className="text-sm font-semibold text-amber-700">
                    이미 가져온 동일 파일입니다. 변경된 상품 메타데이터가 없습니다.
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-emerald-700">
                    상품 메타데이터 가져오기를 완료했습니다.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm text-[var(--text-secondary,#475569)] sm:grid-cols-3">
                  <span>부모 상품 생성 {formatNumber(result.changes.createdProductCount)}</span>
                  <span>부모 상품 갱신 {formatNumber(result.changes.updatedProductCount)}</span>
                  <span>옵션 SKU 생성 {formatNumber(result.changes.createdSkuCount)}</span>
                  <span>옵션 SKU 갱신 {formatNumber(result.changes.updatedSkuCount)}</span>
                  <span>건너뜀 {formatNumber(result.changes.skippedRowCount)}</span>
                </div>
              </section>
            ) : null}
          </div>

          <footer className="flex justify-end gap-2 border-t border-[var(--border,#e2e8f0)] px-6 py-4">
            <button
              type="button"
              onClick={resetAndClose}
              disabled={importMutation.isPending}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-secondary,#475569)] hover:bg-[var(--surface-sunken,#f1f5f9)] disabled:opacity-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={Boolean(accountError) || !file || importMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary,#7048e8)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
              상품 메타데이터 가져오기
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
