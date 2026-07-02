import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Eye, EyeOff, ExternalLink, Loader2, LockKeyhole, RefreshCw, Save, Store, X } from 'lucide-react';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  formatMallCollectionTime,
  isBrowserCollectableMall,
  mallStatus,
  MALL_ACCOUNT_GRID_CLASS,
  type ConversionState,
  type MallAccountDraft,
} from '../lib/order-collection-page-model';
import type { MallCollectionStat } from '../lib/order-collection-stats';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

interface MallAccountSectionProps {
  mallAccounts: OrderCollectionMallAccount[];
  mallLoading: boolean;
  mallSaving: boolean;
  browserCollecting: boolean;
  collectingMallKey: string | null;
  mallError: string | null;
  selectedMall: OrderCollectionMallAccount | null | undefined;
  mallDraft: MallAccountDraft;
  mallSettingsOpen: boolean;
  mallPasswordLoading: boolean;
  mallPasswordVisible: boolean;
  configuredMallCount: number;
  enabledMallCount: number;
  conversionState: ConversionState;
  mallCollectionStats: Map<string, MallCollectionStat>;
  onCollectAll: () => void;
  onRefresh: () => void;
  onOpenSettings: (account: OrderCollectionMallAccount) => void;
  onCollectMall: (account: OrderCollectionMallAccount) => void;
  onSettingsOpenChange: (open: boolean) => void;
  onDraftChange: (draft: MallAccountDraft | ((current: MallAccountDraft) => MallAccountDraft)) => void;
  onPasswordVisibleChange: (visible: boolean | ((current: boolean) => boolean)) => void;
  onOpenMall: () => void;
  onSaveMallAccount: () => void;
}

export function MallAccountSection({
  mallAccounts,
  mallLoading,
  mallSaving,
  browserCollecting,
  collectingMallKey,
  mallError,
  selectedMall,
  mallDraft,
  mallSettingsOpen,
  mallPasswordLoading,
  mallPasswordVisible,
  configuredMallCount,
  enabledMallCount,
  conversionState,
  mallCollectionStats,
  onCollectAll,
  onRefresh,
  onOpenSettings,
  onCollectMall,
  onSettingsOpenChange,
  onDraftChange,
  onPasswordVisibleChange,
  onOpenMall,
  onSaveMallAccount,
}: MallAccountSectionProps) {
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Store size={18} className="text-slate-500" />
            <div>
              <div className="text-sm font-semibold text-slate-900">몰 계정 관리</div>
              <div className="text-xs text-slate-500">
                {formatNumber(configuredMallCount)} / {formatNumber(mallAccounts.length)} 저장
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCollectAll}
              disabled={
                mallLoading ||
                browserCollecting ||
                collectingMallKey !== null ||
                conversionState === 'converting' ||
                enabledMallCount === 0
              }
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {browserCollecting ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              전체 수집
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={mallLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={mallLoading ? 'animate-spin' : ''} />
              새로고침
            </button>
          </div>
        </div>

        <div className="p-5">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <div
              className={cn(
                MALL_ACCOUNT_GRID_CLASS,
                'bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500',
              )}
            >
              <div>몰</div>
              <div>ID</div>
              <div className="text-right">주문</div>
              <div className="text-center">업데이트</div>
              <div className="text-center">상태</div>
              <div className="text-right">작업</div>
            </div>
            <div>
              {mallError && (
                <div className="flex items-center gap-2 px-4 py-5 text-sm text-red-600">
                  <AlertCircle size={15} />
                  {mallError}
                </div>
              )}
              {!mallError && mallLoading && (
                <div className="flex items-center gap-2 px-4 py-5 text-sm text-slate-500">
                  <Loader2 size={15} className="animate-spin" />
                  불러오는 중
                </div>
              )}
              {!mallError && !mallLoading && mallAccounts.map((account) => {
                const status = mallStatus(account);
                const isOpenAccount = mallSettingsOpen && selectedMall?.key === account.key;
                const isCollectingAccount = collectingMallKey === account.key;
                const collectable = isBrowserCollectableMall(account);
                const collectionStat = mallCollectionStats.get(account.key);
                return (
                  <div
                    key={account.key}
                    className={cn(
                      MALL_ACCOUNT_GRID_CLASS,
                      'items-center border-t border-slate-100 px-4 py-3 text-sm',
                      isOpenAccount && 'bg-purple-50/60',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                        {account.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{account.name}</span>
                        <span className="block truncate text-xs text-slate-400">{account.key}</span>
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-slate-600">
                      <span className="truncate">{account.loginId || '-'}</span>
                      {account.hasPassword && (
                        <LockKeyhole size={13} className="flex-none text-emerald-500" aria-label="비밀번호 저장됨" />
                      )}
                    </div>
                    <div
                      className="text-right text-sm font-semibold tabular-nums text-slate-900"
                      title={collectionStat ? `상품 행 ${formatNumber(collectionStat.productRows)}개` : undefined}
                    >
                      {formatNumber(collectionStat?.orderRows ?? 0)}
                    </div>
                    <div
                      className="text-center text-xs tabular-nums text-slate-500"
                      title={collectionStat ? formatDateTime(collectionStat.latestAt) : undefined}
                    >
                      {collectionStat ? formatMallCollectionTime(collectionStat.latestAt) : '-'}
                    </div>
                    <div className="flex justify-center">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-medium',
                          status.tone === 'ready' && 'bg-emerald-50 text-emerald-700',
                          status.tone === 'paused' && 'bg-slate-100 text-slate-500',
                          status.tone === 'empty' && 'bg-amber-50 text-amber-700',
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenSettings(account)}
                        className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        설정
                      </button>
                      <button
                        type="button"
                        onClick={() => onCollectMall(account)}
                        disabled={
                          browserCollecting ||
                          collectingMallKey !== null ||
                          conversionState === 'converting' ||
                          !collectable
                        }
                        title={collectable ? `${account.name} 개별 수집` : '자동 수집 준비 중'}
                        className="inline-flex min-w-[52px] items-center justify-center rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {isCollectingAccount ? <Loader2 size={13} className="animate-spin" /> : '수집'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <MallSettingsDialog
        draft={mallDraft}
        enabledMallCount={enabledMallCount}
        mallPasswordLoading={mallPasswordLoading}
        mallPasswordVisible={mallPasswordVisible}
        mallSaving={mallSaving}
        open={mallSettingsOpen}
        selectedMall={selectedMall}
        onDraftChange={onDraftChange}
        onOpenChange={onSettingsOpenChange}
        onOpenMall={onOpenMall}
        onPasswordVisibleChange={onPasswordVisibleChange}
        onSaveMallAccount={onSaveMallAccount}
      />
    </>
  );
}

interface MallSettingsDialogProps {
  open: boolean;
  selectedMall: OrderCollectionMallAccount | null | undefined;
  draft: MallAccountDraft;
  mallSaving: boolean;
  mallPasswordLoading: boolean;
  mallPasswordVisible: boolean;
  enabledMallCount: number;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: MallAccountDraft | ((current: MallAccountDraft) => MallAccountDraft)) => void;
  onPasswordVisibleChange: (visible: boolean | ((current: boolean) => boolean)) => void;
  onOpenMall: () => void;
  onSaveMallAccount: () => void;
}

function MallSettingsDialog({
  open,
  selectedMall,
  draft,
  mallSaving,
  mallPasswordLoading,
  mallPasswordVisible,
  enabledMallCount,
  onOpenChange,
  onDraftChange,
  onPasswordVisibleChange,
  onOpenMall,
  onSaveMallAccount,
}: MallSettingsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[140] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-sm font-semibold text-slate-900">
                {selectedMall?.name ?? '몰 설정'}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-slate-500">
                {selectedMall?.configured ? '계정 저장됨' : '계정 미설정'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="닫기"
                disabled={mallSaving}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="flex justify-end">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => onDraftChange((current) => ({ ...current, enabled: event.target.checked }))}
                  disabled={!selectedMall || mallSaving}
                  className="h-4 w-4 rounded border-slate-300"
                />
                사용
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">접속 URL</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="url"
                  value={draft.siteUrl}
                  onChange={(event) => onDraftChange((current) => ({ ...current, siteUrl: event.target.value }))}
                  disabled={!selectedMall || mallSaving}
                  placeholder="https://"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={onOpenMall}
                  disabled={!draft.siteUrl}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  aria-label="몰 열기"
                >
                  <ExternalLink size={15} />
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">로그인 ID</span>
              <input
                type="text"
                value={draft.loginId}
                onChange={(event) => onDraftChange((current) => ({ ...current, loginId: event.target.value }))}
                disabled={!selectedMall || mallSaving}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
                <span>비밀번호</span>
                {selectedMall?.hasPassword && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                    저장됨
                  </span>
                )}
              </span>
              <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-slate-400">
                <input
                  type={mallPasswordVisible ? 'text' : 'password'}
                  value={draft.password}
                  onChange={(event) => onDraftChange((current) => ({ ...current, password: event.target.value }))}
                  disabled={!selectedMall || mallSaving || mallPasswordLoading}
                  placeholder={
                    mallPasswordLoading
                      ? '저장된 비밀번호 불러오는 중'
                      : selectedMall?.hasPassword
                        ? '저장된 비밀번호'
                        : '비밀번호 입력'
                  }
                  autoComplete="new-password"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => onPasswordVisibleChange((visible) => !visible)}
                  disabled={!selectedMall || mallPasswordLoading}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  aria-label={mallPasswordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {mallPasswordVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                {selectedMall?.hasPassword
                  ? `저장된 비밀번호를 불러와 표시합니다.${selectedMall.passwordUpdatedAt ? ` 마지막 저장: ${formatDateTime(selectedMall.passwordUpdatedAt)}` : ''}`
                  : '저장하면 암호화되어 보관됩니다.'}
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">메모</span>
              <input
                type="text"
                value={draft.memo}
                onChange={(event) => onDraftChange((current) => ({ ...current, memo: event.target.value }))}
                disabled={!selectedMall || mallSaving}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
            <div className="text-xs text-slate-500">사용 {formatNumber(enabledMallCount)}</div>
            <div className="flex items-center gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={mallSaving}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  취소
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={onSaveMallAccount}
                disabled={!selectedMall || mallSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mallSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                저장
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
