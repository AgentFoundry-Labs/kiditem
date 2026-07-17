'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { BrowserCollectionRunControls } from '@/components/browser-collection/BrowserCollectionRunControls';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { FilePreviewSection } from './components/FilePreviewSection';
import {
  GeneratedFilesSection,
  type GeneratedFilesBulkAction,
} from './components/GeneratedFilesSection';
import { MallAccountSection } from './components/MallAccountSection';
import { OrderActivityFeed } from './components/OrderActivityFeed';
import { OrderCollectionDailyPanel } from './components/OrderCollectionDailyPanel';
import { OrderCollectionPipeline } from './components/OrderCollectionPipeline';
import { OrderUploadModal } from './components/OrderUploadModal';
import { useOrderActivityEvents } from './hooks/use-order-activity-events';
import {
  AUTO_INTERVAL_OPTIONS_MIN,
  useOrderAutoDetect,
} from './hooks/use-order-auto-detect';
import { useOrderCollectionSessionControls } from './hooks/use-order-collection-session-controls';
import { createBrowserMallCollector } from './lib/browser-mall-collection';
import { createGeneratedFileActionLock } from './lib/generated-file-action-lock';
import { isDuplicateGeneratedFile } from './lib/generated-file-dedup';
import { runWithConcurrency } from './lib/order-collection-concurrency';
import { downloadOrderCollectionFile } from './lib/order-collection-download';
import {
  sendOrderFileToSellpiaViaExtension,
  type OrderCollectionExtensionRun,
} from './lib/order-collection-extension';
import {
  ICECREAM_MALL_KEY,
  MAX_HISTORY_ITEMS,
  EMPTY_MALL_DRAFT,
  draftFromMallAccount,
  isBrowserCollectableMall,
  todayYmd,
  type ConversionHistoryItem,
  type ConversionState,
  type MallAccountDraft,
} from './lib/order-collection-page-model';
import {
  buildOrderCollectionPipelineSummary,
  buildOrderCollectionSummary,
} from './lib/order-collection-stats';
import {
  deleteGeneratedOrderFile,
  loadGeneratedOrderFiles,
  saveGeneratedOrderFile,
} from './lib/order-generated-file-store';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
  type UpdateOrderCollectionMallAccountInput,
} from './lib/order-mall-account-api';
import { runSellpiaPostProcess, uploadTrackingForMall } from './lib/order-tracking-actions';

const COLLECT_ALL_CONCURRENCY = 4;

export default function OrderCollectionPage() {
  const queryClient = useQueryClient();
  const historyRef = useRef<ConversionHistoryItem[]>([]);
  const sellpiaSendLockRef = useRef(false);
  const [generatedFileActionLock] = useState(createGeneratedFileActionLock);
  const [state, setState] = useState<ConversionState>('idle');
  const [history, setHistory] = useState<ConversionHistoryItem[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [browserCollecting, setBrowserCollecting] = useState(false);
  const [collectingKeys, setCollectingKeys] = useState<Set<string>>(() => new Set());
  const [selectedMallKey, setSelectedMallKey] = useState<string | null>(ICECREAM_MALL_KEY);
  const [mallDraft, setMallDraft] = useState<MallAccountDraft>(EMPTY_MALL_DRAFT);
  const [mallSettingsOpen, setMallSettingsOpen] = useState(false);
  const [mallPasswordLoading, setMallPasswordLoading] = useState(false);
  const [mallPasswordVisible, setMallPasswordVisible] = useState(false);
  const [sellpiaSendingId, setSellpiaSendingId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<GeneratedFilesBulkAction>(null);
  const [sellpiaPostProcessing, setSellpiaPostProcessing] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const mallAccountsQuery = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: orderMallAccountApi.list,
    meta: { suppressGlobalErrorToast: true },
  });
  const mallAccounts = mallAccountsQuery.data ?? [];
  const sessionControls = useOrderCollectionSessionControls(mallAccounts);
  const collectionSession = sessionControls.session;
  const mallLoading = mallAccountsQuery.isLoading;
  const mallError = mallAccountsQuery.error instanceof Error
    ? mallAccountsQuery.error.message
    : mallAccountsQuery.isError
      ? '몰 계정을 불러오지 못했습니다.'
      : null;

  const saveMallAccountMutation = useMutation({
    mutationKey: queryKeys.orders.collectionMallAction('update'),
    mutationFn: ({
      mallKey,
      input,
    }: {
      mallKey: string;
      input: UpdateOrderCollectionMallAccountInput;
    }) => orderMallAccountApi.update(mallKey, input),
    onSuccess: (saved) => {
      queryClient.setQueryData<OrderCollectionMallAccount[]>(
        queryKeys.orders.collectionMalls(),
        (current) =>
          current?.map((account) => (account.key === saved.key ? saved : account)) ?? [saved],
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.collectionMalls() });
      setMallDraft((current) => ({ ...current, password: '' }));
      setMallSettingsOpen(false);
      toast.success(`${saved.name} 계정 저장 완료`);
    },
    onError: (err) => toast.error(friendlyError(err) ?? '몰 계정 저장 실패'),
  });

  const defaultMall =
    mallAccounts.find((account) => account.key === ICECREAM_MALL_KEY) ?? mallAccounts[0] ?? null;
  const selectedMall =
    mallAccounts.find((account) => account.key === selectedMallKey) ?? defaultMall;
  const configuredMallCount = mallAccounts.filter((account) => account.configured).length;
  const enabledMallCount = mallAccounts.filter(
    (account) => account.enabled && isBrowserCollectableMall(account),
  ).length;
  const previewItem = previewId ? history.find((item) => item.id === previewId) ?? null : null;
  const orderCollectionSummary = useMemo(() => buildOrderCollectionSummary(history), [history]);
  const pipelineSummary = useMemo(
    () => buildOrderCollectionPipelineSummary(history),
    [history],
  );

  const { events, logActivity, clearMallErrorActivity, failedMallAccounts } =
    useOrderActivityEvents(mallAccounts);

  const markCollecting = useCallback((mallKey: string, collecting: boolean) => {
    setCollectingKeys((current) => {
      const next = new Set(current);
      if (collecting) next.add(mallKey);
      else next.delete(mallKey);
      return next;
    });
  }, []);

  const addGeneratedFile = useCallback((historyItem: ConversionHistoryItem) => {
    if (
      historyItem.collectionMode === 'browser' &&
      isDuplicateGeneratedFile(historyRef.current, historyItem)
    ) {
      return;
    }
    setHistory((current) => [
      historyItem,
      ...current.filter((item) => item.id !== historyItem.id).slice(0, MAX_HISTORY_ITEMS - 1),
    ]);
    void saveGeneratedOrderFile(historyItem).catch(() => {
      toast.error('생성 파일 목록 저장 실패');
    });
  }, []);

  const collectBrowserMall = useMemo(
    () => createBrowserMallCollector({ mallAccounts, addGeneratedFile, setPreviewId }),
    [addGeneratedFile, mallAccounts],
  );

  const refreshMallAccounts = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.collectionMalls() });
  }, [queryClient]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    if (mallAccounts.length === 0) return;
    setSelectedMallKey(
      (current) =>
        current ??
        mallAccounts.find((account) => account.key === ICECREAM_MALL_KEY)?.key ??
        mallAccounts[0]?.key ??
        null,
    );
  }, [mallAccounts]);

  useEffect(() => {
    let active = true;
    loadGeneratedOrderFiles()
      .then((files) => {
        if (active) setHistory(files);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setMallDraft(selectedMall ? draftFromMallAccount(selectedMall) : EMPTY_MALL_DRAFT);
  }, [
    selectedMall?.enabled,
    selectedMall?.key,
    selectedMall?.loginId,
    selectedMall?.memo,
    selectedMall?.siteUrl,
  ]);

  const collectAccount = useCallback(
    async (account: OrderCollectionMallAccount, run?: OrderCollectionExtensionRun) => {
      markCollecting(account.key, true);
      let activeRun = run;
      try {
        if (!activeRun) {
          activeRun = await sessionControls.prepareRun(account) ?? undefined;
        }
        if (!activeRun) {
          throw new Error('주문수집 확장프로그램을 찾을 수 없습니다.');
        }
        const collected = await collectBrowserMall(account, activeRun);
        await sessionControls.finalizeRun(
          activeRun,
          'succeeded',
          `${account.name} 수집 및 파일 생성 완료`,
        );
        clearMallErrorActivity(account.name);
        if (collected.rowCount === 0) logActivity('empty', account.name);
        return collected;
      } catch (err) {
        const message = friendlyError(err) ?? '브라우저 수집 실패';
        if (activeRun) {
          await sessionControls.finalizeRun(
            activeRun,
            'failed',
            `${account.name} 파일 생성 실패: ${message}`,
          ).catch((finalizeError) => {
            console.warn('[order-collection] failed to finalize collection session', finalizeError);
          });
        }
        if (!activeRun?.signal?.aborted) {
          logActivity('error', account.name, message);
        }
        throw err;
      } finally {
        if (activeRun) sessionControls.releaseRun(account.key, activeRun.runId);
        markCollecting(account.key, false);
      }
    },
    [clearMallErrorActivity, collectBrowserMall, logActivity, markCollecting, sessionControls],
  );

  const autoDetect = useOrderAutoDetect({
    mallAccounts,
    addGeneratedFile,
    collectAccount,
    markCollecting,
    logActivity,
  });

  const handleBrowserCollectAll = async () => {
    const targets = mallAccounts.filter(
      (account) => account.enabled && isBrowserCollectableMall(account),
    );
    if (targets.length === 0) {
      toast.error('현재 자동 수집 가능한 몰 계정이 없습니다.');
      return;
    }

    setBrowserCollecting(true);
    setState('converting');
    let successCount = 0;
    let failedCount = 0;
    await runWithConcurrency(targets, COLLECT_ALL_CONCURRENCY, async (account) => {
      try {
        await collectAccount(account);
        successCount += 1;
      } catch {
        failedCount += 1;
      }
    });
    setBrowserCollecting(false);
    setState(failedCount > 0 ? 'error' : 'success');
    if (failedCount > 0) {
      toast.warning(
        `전체 수집 ${formatNumber(successCount)}개 성공, ${formatNumber(failedCount)}개 실패`,
      );
    } else {
      toast.success('전체 수집 완료');
    }
  };

  const handleRetryFailedMalls = async () => {
    if (failedMallAccounts.length === 0) return;
    setBrowserCollecting(true);
    await runWithConcurrency(
      failedMallAccounts,
      COLLECT_ALL_CONCURRENCY,
      async (account) => {
        try {
          await collectAccount(account);
        } catch {
          // The error remains in the activity feed for another retry.
        }
      },
    );
    setBrowserCollecting(false);
  };

  const handleBrowserCollectMall = async (
    account: OrderCollectionMallAccount,
    existingRunId?: string,
  ) => {
    if (!account.enabled) {
      toast.error(`${account.name} 계정이 중지되어 있습니다.`);
      return;
    }
    if (!isBrowserCollectableMall(account)) {
      toast.error(`${account.name} 자동 수집은 준비 중입니다.`);
      return;
    }
    setState('converting');
    let run: OrderCollectionExtensionRun | null = null;
    try {
      run = await sessionControls.prepareRun(account, existingRunId);
      if (!run) {
        setState('error');
        toast.error('주문수집 확장프로그램을 찾을 수 없습니다.');
        return;
      }
      const collected = await collectAccount(account, run);
      setState('success');
      if (collected.masked) toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
      if (collected.rowCount > 0) toast.success(`${account.name} 수집 완료`);
    } catch (err) {
      if (run?.signal?.aborted) {
        setState('idle');
        toast.info(`${account.name} 수집을 중단했습니다.`);
      } else {
        setState('error');
        toast.error(friendlyError(err) ?? '브라우저 수집 실패');
      }
    }
  };

  const handleCancelMall = async (account: OrderCollectionMallAccount) => {
    try {
      const requested = await sessionControls.cancelRun(account);
      if (!requested) {
        toast.warning(`${account.name}에서 중단할 수집을 찾지 못했습니다.`);
      }
    } catch (err) {
      toast.error(friendlyError(err) ?? `${account.name} 수집 중단에 실패했습니다.`);
    }
  };

  const restartCollectionSession = async (
    session: NonNullable<typeof collectionSession>,
  ) => {
    const account = sessionControls.restartAccount;
    if (!account) return;
    await handleBrowserCollectMall(account, session.runId);
  };

  const handleModalUpload = async ({
    mall,
    file,
    password,
  }: {
    mall: OrderCollectionMallAccount;
    file: File;
    password?: string;
  }) => {
    setState('converting');
    try {
      const result = await convertUploadedFile(mall, file, password);
      const convertedAt = Date.now();
      const historyItem: ConversionHistoryItem = {
        ...result,
        id: `${convertedAt}-${file.name}`,
        sourceName: file.name.normalize('NFC'),
        convertedAt,
        collectionDate: todayYmd(),
        collectionMode: 'manual-upload',
        mallKey: mall.key,
        mallName: mall.name,
      };
      addGeneratedFile(historyItem);
      setPreviewId(historyItem.id);
      setState('success');
      toast.success(`${mall.name} 변환 완료`);
    } catch (err) {
      setState('error');
      throw err;
    }
  };

  const handleOpenMallSettings = async (account: OrderCollectionMallAccount) => {
    setSelectedMallKey(account.key);
    setMallDraft(draftFromMallAccount(account));
    setMallPasswordVisible(account.hasPassword);
    setMallSettingsOpen(true);
    if (!account.hasPassword) return;

    setMallPasswordLoading(true);
    try {
      const result = await orderMallAccountApi.password(account.key);
      setMallDraft((current) => ({ ...current, password: result.password ?? '' }));
    } catch (err) {
      toast.error(friendlyError(err) ?? '저장된 비밀번호를 불러오지 못했습니다.');
    } finally {
      setMallPasswordLoading(false);
    }
  };

  const handleMallSettingsOpenChange = (open: boolean) => {
    setMallSettingsOpen(open);
    if (!open && selectedMall) {
      setMallDraft(draftFromMallAccount(selectedMall));
      setMallPasswordLoading(false);
      setMallPasswordVisible(false);
    }
  };

  const handleSaveMallAccount = async () => {
    if (!selectedMall) return;
    await saveMallAccountMutation
      .mutateAsync({
        mallKey: selectedMall.key,
        input: {
          loginId: mallDraft.loginId,
          password: mallDraft.password.trim() ? mallDraft.password : undefined,
          siteUrl: mallDraft.siteUrl,
          memo: mallDraft.memo,
          enabled: mallDraft.enabled,
        },
      })
      .catch(() => undefined);
  };

  const handleSendToSellpia = async (
    item: ConversionHistoryItem,
    options: { allowBulk?: boolean; showSuccessToast?: boolean } = {},
  ): Promise<boolean> => {
    const releaseAction = options.allowBulk ? null : generatedFileActionLock.acquire();
    if (
      sellpiaSendLockRef.current ||
      (options.allowBulk ? !generatedFileActionLock.isLocked() : releaseAction === null)
    ) {
      releaseAction?.();
      return false;
    }
    sellpiaSendLockRef.current = true;
    setSellpiaSendingId(item.id);
    try {
      const shopName = item.mallName ?? '아이스크림몰';
      const result = await sendOrderFileToSellpiaViaExtension({
        shopName,
        fileName: item.fileName,
        blob: item.blob,
      });
      const updatedItem = { ...item, sentAt: Date.now() };
      setHistory((current) =>
        current.map((entry) => (entry.id === item.id ? updatedItem : entry)),
      );
      await saveGeneratedOrderFile(updatedItem).catch(() => {
        toast.warning('전송은 완료됐지만 전송 상태를 저장하지 못했습니다.');
      });
      if (options.showSuccessToast !== false) {
        toast.success(`셀피아 전송 완료 — ${result.shop ?? shopName}`);
      }
      return true;
    } catch (err) {
      toast.error(friendlyError(err) ?? '셀피아 전송 실패');
      return false;
    } finally {
      setSellpiaSendingId(null);
      sellpiaSendLockRef.current = false;
      releaseAction?.();
    }
  };

  const handleSendSelectedToSellpia = async (items: ConversionHistoryItem[]) => {
    if (items.length === 0) return;
    const releaseAction = generatedFileActionLock.acquire();
    if (!releaseAction) return;
    setBulkAction('send');
    let successCount = 0;
    try {
      for (const item of items) {
        if (await handleSendToSellpia(item, { allowBulk: true, showSuccessToast: false })) {
          successCount += 1;
        }
      }
      if (successCount > 0) {
        toast.success(`선택 파일 ${formatNumber(successCount)}개 셀피아 전송 완료`);
      }
    } finally {
      setBulkAction(null);
      releaseAction();
    }
  };

  const handleSellpiaPostProcess = async () => {
    if (sellpiaPostProcessing) return;
    setSellpiaPostProcessing(true);
    try {
      await runSellpiaPostProcess({
        logError: (title, message) => logActivity('error', title, message),
      });
    } finally {
      setSellpiaPostProcessing(false);
    }
  };

  const handleDownloadSelected = async (items: ConversionHistoryItem[]) => {
    if (items.length === 0) return;
    const releaseAction = generatedFileActionLock.acquire();
    if (!releaseAction) return;
    setBulkAction('download');
    try {
      for (const item of items) {
        downloadOrderCollectionFile(item);
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      toast.success(`선택 파일 ${formatNumber(items.length)}개 다운로드 요청 완료`);
    } finally {
      setBulkAction(null);
      releaseAction();
    }
  };

  const deleteGeneratedFiles = async (items: ConversionHistoryItem[]) => {
    const deletedIds = new Set<string>();
    for (const item of items) {
      try {
        await deleteGeneratedOrderFile(item.id);
        deletedIds.add(item.id);
      } catch {
        // Keep failed rows available for another attempt.
      }
    }
    if (deletedIds.size > 0) {
      setHistory((current) => current.filter((item) => !deletedIds.has(item.id)));
      setPreviewId((current) => (current && deletedIds.has(current) ? null : current));
    }
    return deletedIds.size;
  };

  const handleDeleteGeneratedFile = async (item: ConversionHistoryItem) => {
    if (!window.confirm(`'${item.fileName}' 파일을 삭제할까요?`)) return;
    const releaseAction = generatedFileActionLock.acquire();
    if (!releaseAction) return;
    setBulkAction('delete');
    try {
      const deletedCount = await deleteGeneratedFiles([item]);
      if (deletedCount === 1) toast.success('생성 파일을 삭제했습니다.');
      else toast.error('생성 파일을 삭제하지 못했습니다.');
    } finally {
      setBulkAction(null);
      releaseAction();
    }
  };

  const handleDeleteSelected = async (items: ConversionHistoryItem[]) => {
    if (
      items.length === 0 ||
      !window.confirm(`선택한 파일 ${formatNumber(items.length)}개를 삭제할까요?`)
    ) {
      return;
    }
    const releaseAction = generatedFileActionLock.acquire();
    if (!releaseAction) return;
    setBulkAction('delete');
    try {
      const deletedCount = await deleteGeneratedFiles(items);
      if (deletedCount === items.length) {
        toast.success(`선택 파일 ${formatNumber(deletedCount)}개를 삭제했습니다.`);
      } else {
        toast.warning(
          `${formatNumber(deletedCount)}개 삭제 완료, ${formatNumber(items.length - deletedCount)}개 실패`,
        );
      }
    } finally {
      setBulkAction(null);
      releaseAction();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <FileSpreadsheet size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">주문 수집</h1>
            <div className="text-sm text-slate-500">
              여러 몰 주문을 수집해 셀피아 납품 양식으로 변환합니다
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          <Upload size={16} />
          업로드
        </button>
      </div>

      <OrderUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        mallAccounts={mallAccounts}
        defaultMallKey={selectedMallKey ?? ICECREAM_MALL_KEY}
        onUpload={handleModalUpload}
      />

      <OrderCollectionPipeline summary={pipelineSummary} />

      <div className="grid gap-3 xl:grid-cols-4">
        <div className="min-w-0 xl:col-span-3">
          <OrderCollectionDailyPanel history={history} />
        </div>
        <OrderActivityFeed
          className="min-h-[430px] max-h-[460px] xl:col-span-1"
          history={history}
          events={events}
        />
      </div>

      <MallAccountSection
        autoDetect={autoDetect.enabled}
        autoIntervalMin={autoDetect.intervalMin}
        autoIntervalOptions={AUTO_INTERVAL_OPTIONS_MIN}
        autoLastRunAt={autoDetect.lastRunAt}
        autoNextRunAt={autoDetect.nextRunAt}
        autoRunning={autoDetect.running}
        browserCollecting={browserCollecting}
        cancellingKeys={sessionControls.cancellingKeys}
        collectingKeys={collectingKeys}
        configuredMallCount={configuredMallCount}
        conversionState={state}
        collectionControls={collectionSession ? (
          <BrowserCollectionRunControls
            session={collectionSession}
            onWebRestart={restartCollectionSession}
            webRestartUnavailableMessage={sessionControls.webRestartUnavailableMessage}
          />
        ) : undefined}
        enabledMallCount={enabledMallCount}
        failedMallCount={failedMallAccounts.length}
        mallAccounts={mallAccounts}
        mallCollectionStats={orderCollectionSummary.mallStatsByKey}
        mallDraft={mallDraft}
        mallError={mallError}
        mallLoading={mallLoading}
        mallPasswordLoading={mallPasswordLoading}
        mallPasswordVisible={mallPasswordVisible}
        mallSaving={saveMallAccountMutation.isPending}
        mallSettingsOpen={mallSettingsOpen}
        selectedMall={selectedMall}
        onAutoIntervalChange={autoDetect.changeInterval}
        onCollectAll={() => void handleBrowserCollectAll()}
        onCancelMall={(account) => void handleCancelMall(account)}
        onCollectMall={(account) => void handleBrowserCollectMall(account)}
        onDraftChange={setMallDraft}
        onOpenMall={() => {
          if (mallDraft.siteUrl) window.open(mallDraft.siteUrl, '_blank', 'noopener,noreferrer');
        }}
        onOpenSettings={(account) => void handleOpenMallSettings(account)}
        onPasswordVisibleChange={setMallPasswordVisible}
        onRefresh={refreshMallAccounts}
        onRetryFailedMalls={() => void handleRetryFailedMalls()}
        onSaveMallAccount={() => void handleSaveMallAccount()}
        onSettingsOpenChange={handleMallSettingsOpenChange}
        onToggleAutoDetect={autoDetect.toggle}
        onUploadTracking={(account) =>
          void uploadTrackingForMall({
            account,
            logError: (title, message) => logActivity('error', title, message),
          })
        }
      />

      {previewItem ? (
        <FilePreviewSection
          item={previewItem}
          onClose={() => setPreviewId(null)}
          onDownload={downloadOrderCollectionFile}
        />
      ) : null}

      <GeneratedFilesSection
        items={history}
        bulkAction={bulkAction}
        sellpiaSendingId={sellpiaSendingId}
        sellpiaPostProcessing={sellpiaPostProcessing}
        onDelete={(item) => void handleDeleteGeneratedFile(item)}
        onDeleteSelected={(items) => void handleDeleteSelected(items)}
        onDownload={downloadOrderCollectionFile}
        onDownloadSelected={(items) => void handleDownloadSelected(items)}
        onPreview={setPreviewId}
        onSellpiaPostProcess={() => void handleSellpiaPostProcess()}
        onSendToSellpia={(item) => void handleSendToSellpia(item)}
        onSendSelectedToSellpia={(items) => void handleSendSelectedToSellpia(items)}
      />
    </div>
  );
}

async function convertUploadedFile(
  mall: OrderCollectionMallAccount,
  file: File,
  password?: string,
) {
  if (mall.key === 'domeggook') {
    const { convertDomeggookOrderFile } = await import('./lib/order-collection-api');
    return convertDomeggookOrderFile(file);
  }
  if (mall.key === 'gs-shop') {
    const { convertGsshopOrderFile } = await import('./lib/order-collection-api');
    return convertGsshopOrderFile(file, { download: false });
  }
  if (mall.key === ICECREAM_MALL_KEY) {
    const { convertIcecreamMallOrderFile } = await import('./lib/order-collection-api');
    return convertIcecreamMallOrderFile(file, password);
  }
  throw new Error(`${mall.name} 업로드 변환은 아직 준비 중입니다.`);
}
