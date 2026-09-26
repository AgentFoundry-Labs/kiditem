'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FileSpreadsheet, Loader2, X } from 'lucide-react';
import type { ChannelAccountListItem } from '@kiditem/shared/channel-account';
import type { WingCatalogWorkbookUpload } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/wing-catalog-collection';
import { friendlyError } from '@/lib/api-error';
import type { RocketMatchingCsvUpload } from '../lib/channel-sku-matching-api';
import { formatNumber } from '@/lib/utils';
import {
  type ChannelCatalogImportSource,
  useImportChannelCatalog,
} from '../hooks/useChannelSkuMappings';

type ChannelCatalogImportDialogProps = {
  open: boolean;
  accounts: ChannelAccountListItem[];
  defaultAccount: ChannelAccountListItem | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

type CatalogImportResponse =
  | WingCatalogWorkbookUpload
  | RocketMatchingCsvUpload;

type AutomaticMatchingSummary = {
  collectedAliases: number;
  evaluatedListings: number;
  matchedListings: number;
  configuredOptions: number;
  error: string | null;
};

const IMPORT_OPTIONS: Record<ChannelCatalogImportSource, {
  channel: ChannelAccountListItem['channel'];
  label: string;
  fileLabel: string;
  accept: string;
  description: string;
}> = {
  wing: {
    channel: 'coupang',
    label: 'Coupang Wing',
    fileLabel: '쿠팡 Wing 상품 엑셀 파일',
    accept: '.xlsx,.xls',
    description: '상품·옵션 정보를 갱신합니다.',
  },
  rocket: {
    channel: 'rocket',
    label: 'Coupang Rocket',
    fileLabel: '쿠팡 Rocket 매칭 CSV 파일',
    accept: '.csv',
    description: 'skuId 기준으로 상품·옵션을 갱신합니다.',
  },
};

export function ChannelCatalogImportDialog({
  open,
  accounts,
  defaultAccount,
  onOpenChange,
  onSuccess,
}: ChannelCatalogImportDialogProps) {
  const initialSource = sourceForAccount(defaultAccount);
  const [source, setSource] = useState<ChannelCatalogImportSource>(initialSource);
  const [channelAccountId, setChannelAccountId] = useState(defaultAccount?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CatalogImportResponse | null>(null);
  const [automaticMatching, setAutomaticMatching] = useState<AutomaticMatchingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importMutation = useImportChannelCatalog();
  const sourceAccounts = useMemo(() => accounts.filter((account) =>
    account.channel === IMPORT_OPTIONS[source].channel), [accounts, source]);
  const selectedAccount = sourceAccounts.find((account) => account.id === channelAccountId) ?? null;

  useEffect(() => {
    if (!open) return;
    const nextSource = sourceForAccount(defaultAccount);
    const matchingDefault = defaultAccount?.channel === IMPORT_OPTIONS[nextSource].channel
      ? defaultAccount
      : null;
    const fallbackAccount = accounts.find((account) =>
      account.channel === IMPORT_OPTIONS[nextSource].channel) ?? null;
    setSource(nextSource);
    setChannelAccountId((matchingDefault ?? fallbackAccount)?.id ?? '');
    setFile(null);
    setResult(null);
    setAutomaticMatching(null);
    setError(null);
  }, [accounts, defaultAccount, open]);

  const resetAndClose = () => {
    if (importMutation.isPending) return;
    setFile(null);
    setResult(null);
    setAutomaticMatching(null);
    setError(null);
    onOpenChange(false);
  };

  const handleSourceChange = (nextSource: ChannelCatalogImportSource) => {
    const nextAccount = accounts.find((account) =>
      account.channel === IMPORT_OPTIONS[nextSource].channel) ?? null;
    setSource(nextSource);
    setChannelAccountId(nextAccount?.id ?? '');
    setFile(null);
    setResult(null);
    setAutomaticMatching(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!selectedAccount || !file) return;
    setError(null);
    setResult(null);
    setAutomaticMatching(null);
    try {
      const outcome = await importMutation.mutateAsync({
        source,
        channelAccountId: selectedAccount.id,
        file,
      });
      setResult(outcome.response);
      setAutomaticMatching(outcome.automaticMatching);
      onSuccess();
    } catch (uploadError) {
      setError(friendlyError(uploadError) ?? '상품 파일을 가져오지 못했습니다.');
    }
  };

  const sourceConfig = IMPORT_OPTIONS[source];
  const accountError = sourceAccounts.length === 0
    ? `${sourceConfig.label} 활성 계정이 없습니다.`
    : !selectedAccount
      ? `${sourceConfig.label} 계정을 선택해 주세요.`
      : null;

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
                상품 파일 가져오기
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary,#475569)]">
                채널과 계정을 선택해 해당 형식의 상품 파일을 가져옵니다.
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
              {sourceConfig.description} 셀피아의 저장된 상품 매칭과 검증된 차감 수량이 있는 빈 옵션만 자동 연결하며, 이미 확정한 재고 연결은 변경하지 않습니다.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-[var(--text-primary,#0f172a)]">
                <span>가져올 채널</span>
                <select
                  aria-label="가져올 채널"
                  value={source}
                  disabled={importMutation.isPending}
                  onChange={(event) => handleSourceChange(event.target.value as ChannelCatalogImportSource)}
                  className="w-full rounded-xl border border-[var(--border,#cbd5e1)] bg-[var(--surface,#fff)] px-3 py-2.5 text-sm"
                >
                  <option value="wing">Coupang Wing</option>
                  <option value="rocket">Coupang Rocket</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-[var(--text-primary,#0f172a)]">
                <span>가져올 계정</span>
                <select
                  aria-label="가져올 계정"
                  value={channelAccountId}
                  disabled={importMutation.isPending || sourceAccounts.length === 0}
                  onChange={(event) => {
                    setChannelAccountId(event.target.value);
                    setFile(null);
                    setResult(null);
                    setAutomaticMatching(null);
                    setError(null);
                  }}
                  className="w-full rounded-xl border border-[var(--border,#cbd5e1)] bg-[var(--surface,#fff)] px-3 py-2.5 text-sm"
                >
                  {sourceAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
            </div>

            {accountError ? (
              <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                {accountError}
              </p>
            ) : null}

            <label className="block space-y-2 text-sm font-semibold text-[var(--text-primary,#0f172a)]">
              <span>{sourceConfig.fileLabel}</span>
              <input
                aria-label={sourceConfig.fileLabel}
                type="file"
                accept={sourceConfig.accept}
                disabled={Boolean(accountError) || importMutation.isPending}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setResult(null);
                  setAutomaticMatching(null);
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

            {automaticMatching?.error ? (
              <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                상품·옵션 가져오기는 완료했지만 자동 재고 연결을 마치지 못했습니다. {automaticMatching.error}
              </p>
            ) : null}

            {result ? <ImportResult result={result} automaticMatching={automaticMatching} /> : null}
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
              상품·재고 가져오기
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImportResult({
  result,
  automaticMatching,
}: {
  result: CatalogImportResponse;
  automaticMatching: AutomaticMatchingSummary | null;
}) {
  const skippedRowCount = 'skippedRowCount' in result.changes
    ? result.changes.skippedRowCount
    : null;
  return (
    <section aria-label="상품 파일 가져오기 결과" className="space-y-3 rounded-xl border border-[var(--border,#e2e8f0)] p-4">
      {result.duplicate ? (
        <p className="text-sm font-semibold text-amber-700">
          이미 가져온 동일 파일입니다. 상품·옵션 변경 없이 자동 재고 연결만 다시 확인했습니다.
        </p>
      ) : automaticMatching?.error ? (
        <p className="text-sm font-semibold text-emerald-700">상품·옵션 가져오기를 완료했습니다.</p>
      ) : (
        <p className="text-sm font-semibold text-emerald-700">상품·옵션 가져오기와 자동 재고 연결을 완료했습니다.</p>
      )}
      <div className="grid grid-cols-2 gap-2 text-sm text-[var(--text-secondary,#475569)] sm:grid-cols-3">
        <span>부모 상품 생성 {formatNumber(result.changes.createdProductCount)}</span>
        <span>부모 상품 갱신 {formatNumber(result.changes.updatedProductCount)}</span>
        <span>옵션 SKU 생성 {formatNumber(result.changes.createdSkuCount)}</span>
        <span>옵션 SKU 갱신 {formatNumber(result.changes.updatedSkuCount)}</span>
        {skippedRowCount !== null ? <span>건너뜀 {formatNumber(skippedRowCount)}</span> : null}
        {automaticMatching ? <span>자동 재고 연결 {formatNumber(automaticMatching.configuredOptions)}</span> : null}
      </div>
    </section>
  );
}

function sourceForAccount(account: ChannelAccountListItem | null): ChannelCatalogImportSource {
  return account?.channel === 'rocket' ? 'rocket' : 'wing';
}
