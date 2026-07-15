import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Store,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import {
  formatMallCollectionTime,
  isAutoDetectableMall,
  isBrowserCollectableMall,
  type ConversionState,
  type MallAccountDraft,
} from "../lib/order-collection-page-model";
import { isTrackingSupportedMall } from "../lib/icecream-tracking-api";
import type { MallCollectionStat } from "../lib/order-collection-stats";
import type { OrderCollectionMallAccount } from "../lib/order-mall-account-api";

type MallAccountGroup = "action" | "collectable" | "setup";

const MALL_ACCOUNT_GROUPS: Array<{ id: MallAccountGroup; label: string }> = [
  { id: "action", label: "조치 필요" },
  { id: "collectable", label: "수집 가능" },
  { id: "setup", label: "설정 필요" },
];

export function classifyMallAccount(
  account: OrderCollectionMallAccount,
  collectionStat: MallCollectionStat | undefined,
  collectionActive = false,
): MallAccountGroup {
  if (!account.configured || !account.enabled || !isBrowserCollectableMall(account)) {
    return "setup";
  }
  if (collectionActive || (collectionStat?.newRows ?? 0) > 0) return "action";
  return "collectable";
}

interface MallAccountSectionProps {
  collectionControls?: ReactNode;
  mallAccounts: OrderCollectionMallAccount[];
  mallLoading: boolean;
  mallSaving: boolean;
  browserCollecting: boolean;
  collectingKeys: Set<string>;
  cancellingKeys: Set<string>;
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
  autoDetect: boolean;
  autoIntervalMin: number;
  autoIntervalOptions: readonly number[];
  autoLastRunAt: number | null;
  autoNextRunAt: number | null;
  autoRunning: boolean;
  failedMallCount: number;
  onCollectAll: () => void;
  onRetryFailedMalls: () => void;
  onRefresh: () => void;
  onOpenSettings: (account: OrderCollectionMallAccount) => void;
  onCollectMall: (account: OrderCollectionMallAccount) => void;
  onCancelMall: (account: OrderCollectionMallAccount) => void;
  onUploadTracking: (account: OrderCollectionMallAccount) => void;
  onToggleAutoDetect: () => void;
  onAutoIntervalChange: (minutes: number) => void;
  onSettingsOpenChange: (open: boolean) => void;
  onDraftChange: (
    draft: MallAccountDraft | ((current: MallAccountDraft) => MallAccountDraft),
  ) => void;
  onPasswordVisibleChange: (
    visible: boolean | ((current: boolean) => boolean),
  ) => void;
  onOpenMall: () => void;
  onSaveMallAccount: () => void;
}

export function MallAccountSection({
  collectionControls,
  mallAccounts,
  mallLoading,
  mallSaving,
  browserCollecting,
  collectingKeys,
  cancellingKeys,
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
  autoDetect,
  autoIntervalMin,
  autoIntervalOptions,
  autoLastRunAt,
  autoNextRunAt,
  autoRunning,
  failedMallCount,
  onCollectAll,
  onRetryFailedMalls,
  onRefresh,
  onOpenSettings,
  onCollectMall,
  onCancelMall,
  onUploadTracking,
  onToggleAutoDetect,
  onAutoIntervalChange,
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
              <div className="text-sm font-semibold text-slate-900">
                주문수집
              </div>
              <div className="text-xs text-slate-500">
                {formatNumber(configuredMallCount)} /{" "}
                {formatNumber(mallAccounts.length)} 계정
                {autoDetect ? ` · 자동감지 ${autoIntervalMin}분 (09–18시)` : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {autoLastRunAt !== null ? (
              <span className="hidden text-xs tabular-nums text-slate-400 sm:inline">
                자동감지 {formatMallCollectionTime(autoLastRunAt)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onToggleAutoDetect}
              title="설정한 간격마다 새 주문을 자동 감지합니다 (오전 9시~오후 6시, 이 페이지가 열려 있을 때)"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                autoDetect
                  ? "border-purple-200 bg-purple-50 text-purple-700"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  autoDetect ? "bg-purple-600" : "bg-slate-300",
                )}
              />
              자동감지
            </button>
            <select
              value={autoIntervalMin}
              onChange={(event) =>
                onAutoIntervalChange(Number(event.target.value))
              }
              aria-label="자동 감지 간격"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-600 outline-none hover:bg-slate-50 focus:border-slate-400"
            >
              {autoIntervalOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes}분
                </option>
              ))}
            </select>
            {failedMallCount > 0 ? (
              <button
                type="button"
                onClick={onRetryFailedMalls}
                disabled={browserCollecting || collectingKeys.size > 0}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                <AlertCircle size={15} />
                실패 몰 재수집 ({formatNumber(failedMallCount)})
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCollectAll}
              disabled={
                mallLoading ||
                browserCollecting ||
                collectingKeys.size > 0 ||
                conversionState === "converting" ||
                enabledMallCount === 0
              }
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {browserCollecting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RefreshCw size={15} />
              )}
              전체 수집
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={mallLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={mallLoading ? "animate-spin" : ""}
              />
              새로고침
            </button>
          </div>
        </div>

        <div className="p-5">
          {collectionControls ? <div className="mb-3">{collectionControls}</div> : null}
          {mallError ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-5 text-sm text-red-600">
              <AlertCircle size={15} />
              {mallError}
            </div>
          ) : mallLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-5 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" />
              불러오는 중
            </div>
          ) : (
            <div className="space-y-5 overflow-x-auto pb-1">
              {MALL_ACCOUNT_GROUPS.map((group) => {
                const groupedAccounts = mallAccounts.filter((account) =>
                  classifyMallAccount(
                    account,
                    mallCollectionStats.get(account.key),
                    collectingKeys.has(account.key) || cancellingKeys.has(account.key),
                  ) === group.id,
                );
                return (
                  <section key={group.id} aria-labelledby={`mall-group-${group.id}`}>
                    <h3 id={`mall-group-${group.id}`} className="mb-2 text-xs font-semibold text-slate-600">
                      {group.label} <span className="text-slate-400">{groupedAccounts.length}</span>
                    </h3>
                    <div className="grid min-w-[720px] grid-cols-5 gap-3">
                {groupedAccounts.map((account) => {
                  const isOpenAccount =
                    mallSettingsOpen && selectedMall?.key === account.key;
                  const isCollectingAccount = collectingKeys.has(account.key);
                  const isCancellingAccount = cancellingKeys.has(account.key);
                  const collectable =
                    account.enabled && isBrowserCollectableMall(account);
                  const autoDetectable = isAutoDetectableMall(account);
                  const collectionStat = mallCollectionStats.get(account.key);
                  const trackingSupported = isTrackingSupportedMall(
                    account.key,
                  );

                  return (
                    <article
                      key={account.key}
                      aria-label={`${account.name} 계정 카드`}
                      className={cn(
                        "flex flex-col rounded-xl border p-3.5 transition-colors",
                        collectable
                          ? "border-slate-200 hover:border-purple-300"
                          : "border-slate-100 bg-slate-50/40",
                        isOpenAccount && "ring-1 ring-purple-300",
                      )}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 flex-none rounded-full",
                              collectable ? "bg-emerald-500" : "bg-slate-300",
                            )}
                            title={collectable ? "수집 가능" : "준비 중"}
                          />
                          <span
                            className={cn(
                              "truncate text-[13px] font-semibold",
                              collectable ? "text-slate-900" : "text-slate-400",
                            )}
                            title={account.name}
                          >
                            {account.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenSettings(account)}
                          aria-label={`${account.name} 설정`}
                          className="flex-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
                        >
                          설정
                        </button>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 divide-x divide-slate-200/80 overflow-hidden rounded-lg bg-slate-50">
                        <div
                          className="px-2 py-3.5 text-center"
                          title={
                            collectionStat
                              ? `오늘 수집 ${formatMallCollectionTime(collectionStat.latestAt)}`
                              : undefined
                          }
                        >
                          <div
                            className={cn(
                              "text-lg font-bold leading-none tabular-nums",
                              collectionStat && collectionStat.orderRows > 0
                                ? "text-slate-900"
                                : "text-slate-300",
                            )}
                          >
                            {formatNumber(collectionStat?.orderRows ?? 0)}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            당일
                          </div>
                        </div>
                        <div
                          className="px-2 py-3.5 text-center"
                          title="오늘 주문 중 셀피아 전송 대기"
                        >
                          <div
                            className={cn(
                              "text-lg font-bold leading-none tabular-nums",
                              collectionStat && collectionStat.newRows > 0
                                ? "text-purple-600"
                                : "text-slate-300",
                            )}
                          >
                            {formatNumber(collectionStat?.newRows ?? 0)}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            전송 대기
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 flex h-5 items-center justify-center text-[11px]">
                        {!collectable ? (
                          <span className="text-slate-300">준비 중</span>
                        ) : autoDetect &&
                          autoDetectable &&
                          autoNextRunAt !== null ? (
                          <AutoDetectCountdown
                            running={autoRunning}
                            targetAt={autoNextRunAt}
                          />
                        ) : (
                          <span className="text-slate-300">수동</span>
                        )}
                      </div>

                      <div className="mt-2.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            isCollectingAccount
                              ? onCancelMall(account)
                              : onCollectMall(account)
                          }
                          aria-label={`${account.name} ${
                            isCollectingAccount
                              ? isCancellingAccount
                                ? "중단 중"
                                : "중단"
                              : "수집"
                          }`}
                          disabled={isCollectingAccount
                            ? isCancellingAccount
                            : browserCollecting ||
                              conversionState === "converting" ||
                              !collectable}
                          title={
                            isCollectingAccount
                              ? `${account.name} 수집 중단`
                              : !account.enabled
                              ? "중지된 계정입니다."
                              : collectable
                                ? `${account.name} 개별 수집`
                                : "자동 수집 준비 중"
                          }
                          className={cn(
                            "inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md py-1.5 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400",
                            isCollectingAccount
                              ? "bg-red-500 hover:bg-red-600"
                              : "bg-purple-600 hover:bg-purple-700",
                          )}
                        >
                          {isCollectingAccount ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              {isCancellingAccount ? "중단 중…" : "중단"}
                            </>
                          ) : (
                            "수집"
                          )}
                        </button>
                        {trackingSupported ? (
                          <button
                            type="button"
                            onClick={() => onUploadTracking(account)}
                            disabled={isCollectingAccount}
                            aria-label={`${account.name} 송장 업로드`}
                            title={`${account.name} 송장 업로드`}
                            className="inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-purple-200 bg-purple-50 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
                          >
                            <Upload size={13} />
                            송장 업로드
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            aria-label={`${account.name} 송장 업로드 준비 중`}
                            className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-1 whitespace-nowrap rounded-md border border-dashed border-slate-200 bg-slate-50 py-1.5 text-xs font-medium text-slate-400"
                          >
                            <Truck size={13} />
                            준비
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
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

function AutoDetectCountdown({
  targetAt,
  running,
}: {
  targetAt: number;
  running: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (running) return <span className="text-purple-600">자동 수집 중</span>;
  const seconds = Math.max(0, Math.ceil((targetAt - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return (
    <span className="tabular-nums text-purple-600">
      자동 {minutes}:{String(remainder).padStart(2, "0")}
    </span>
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
  onDraftChange: (
    draft: MallAccountDraft | ((current: MallAccountDraft) => MallAccountDraft),
  ) => void;
  onPasswordVisibleChange: (
    visible: boolean | ((current: boolean) => boolean),
  ) => void;
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
                {selectedMall?.name ?? "몰 설정"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-slate-500">
                {selectedMall?.configured ? "계정 저장됨" : "계정 미설정"}
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
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  disabled={!selectedMall || mallSaving}
                  className="h-4 w-4 rounded border-slate-300"
                />
                사용
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                접속 URL
              </span>
              <div className="mt-1 flex gap-2">
                <input
                  type="url"
                  value={draft.siteUrl}
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      siteUrl: event.target.value,
                    }))
                  }
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
              <span className="text-xs font-medium text-slate-600">
                로그인 ID
              </span>
              <input
                type="text"
                value={draft.loginId}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    loginId: event.target.value,
                  }))
                }
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
                  type={mallPasswordVisible ? "text" : "password"}
                  value={draft.password}
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  disabled={!selectedMall || mallSaving || mallPasswordLoading}
                  placeholder={
                    mallPasswordLoading
                      ? "저장된 비밀번호 불러오는 중"
                      : selectedMall?.hasPassword
                        ? "저장된 비밀번호"
                        : "비밀번호 입력"
                  }
                  autoComplete="new-password"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => onPasswordVisibleChange((visible) => !visible)}
                  disabled={!selectedMall || mallPasswordLoading}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  aria-label={
                    mallPasswordVisible ? "비밀번호 숨기기" : "비밀번호 보기"
                  }
                >
                  {mallPasswordVisible ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                {selectedMall?.hasPassword
                  ? `저장된 비밀번호를 불러와 표시합니다.${selectedMall.passwordUpdatedAt ? ` 마지막 저장: ${formatDateTime(selectedMall.passwordUpdatedAt)}` : ""}`
                  : "저장하면 암호화되어 보관됩니다."}
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">메모</span>
              <input
                type="text"
                value={draft.memo}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    memo: event.target.value,
                  }))
                }
                disabled={!selectedMall || mallSaving}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
            <div className="text-xs text-slate-500">
              사용 {formatNumber(enabledMallCount)}
            </div>
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
                {mallSaving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                저장
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
