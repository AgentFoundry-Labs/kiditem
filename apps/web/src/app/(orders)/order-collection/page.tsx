'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { downloadOrderCollectionFile } from './lib/order-collection-download';
import { sendOrderFileToSellpiaViaExtension } from './lib/order-collection-extension';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
  type UpdateOrderCollectionMallAccountInput,
} from './lib/order-mall-account-api';
import {
  loadGeneratedOrderFiles,
  saveGeneratedOrderFile,
} from './lib/order-generated-file-store';
import { buildOrderCollectionSummary } from './lib/order-collection-stats';
import {
  EMPTY_MALL_DRAFT,
  ICECREAM_MALL_KEY,
  MAX_HISTORY_ITEMS,
  draftFromMallAccount,
  getOrderCount,
  groupHistoryByDay,
  isBrowserCollectableMall,
  todayYmd,
  type ConversionHistoryItem,
  type ConversionState,
  type MallAccountDraft,
} from './lib/order-collection-page-model';
import { createBrowserMallCollector } from './lib/browser-mall-collection';
import { FilePreviewSection } from './components/FilePreviewSection';
import { GeneratedFilesSection } from './components/GeneratedFilesSection';
import { MallAccountSection } from './components/MallAccountSection';
import { ManualUploadSection } from './components/ManualUploadSection';
import { OrderCollectionDailyPanel } from './components/OrderCollectionDailyPanel';
import { OrderCollectionFlow } from './components/OrderCollectionFlow';

export default function OrderCollectionPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [state, setState] = useState<ConversionState>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<ConversionHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filePassword, setFilePassword] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [browserCollecting, setBrowserCollecting] = useState(false);
  const [collectingMallKey, setCollectingMallKey] = useState<string | null>(null);
  const [selectedMallKey, setSelectedMallKey] = useState<string | null>(ICECREAM_MALL_KEY);
  const [mallDraft, setMallDraft] = useState<MallAccountDraft>(EMPTY_MALL_DRAFT);
  const [mallSettingsOpen, setMallSettingsOpen] = useState(false);
  const [mallPasswordLoading, setMallPasswordLoading] = useState(false);
  const [mallPasswordVisible, setMallPasswordVisible] = useState(false);
  const [sellpiaSendingId, setSellpiaSendingId] = useState<string | null>(null);

  const mallAccountsQuery = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: orderMallAccountApi.list,
    meta: { suppressGlobalErrorToast: true },
  });
  const mallAccounts = mallAccountsQuery.data ?? [];
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
        (current) => current?.map((account) => (account.key === saved.key ? saved : account)) ?? [saved],
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.collectionMalls() });
      setMallDraft((current) => ({ ...current, password: '' }));
      setMallSettingsOpen(false);
      toast.success(`${saved.name} 계정 저장 완료`);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : '몰 계정 저장 실패';
      toast.error(message);
    },
  });
  const mallSaving = saveMallAccountMutation.isPending;

  const canConvert = selectedFile !== null && state !== 'converting';
  const lastResult = history[0] ?? null;
  const previewItem = previewId ? history.find((item) => item.id === previewId) ?? null : null;
  const defaultMall =
    mallAccounts.find((account) => account.key === ICECREAM_MALL_KEY) ?? mallAccounts[0] ?? null;
  const selectedMall =
    mallAccounts.find((account) => account.key === selectedMallKey) ?? defaultMall;
  const configuredMallCount = mallAccounts.filter((account) => account.configured).length;
  const enabledMallCount = mallAccounts.filter(
    (account) => account.enabled && isBrowserCollectableMall(account),
  ).length;
  const lastOrderCount = getOrderCount(lastResult);

  const generatedFileGroups = useMemo(() => groupHistoryByDay(history), [history]);
  const orderCollectionSummary = useMemo(() => buildOrderCollectionSummary(history), [history]);

  const refreshMallAccounts = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.collectionMalls() });
  }, [queryClient]);

  useEffect(() => {
    if (mallAccounts.length === 0) return;
    setSelectedMallKey(
      (current) =>
        current ?? mallAccounts.find((account) => account.key === ICECREAM_MALL_KEY)?.key ?? mallAccounts[0]?.key ?? null,
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
  }, [selectedMall?.key, selectedMall?.loginId, selectedMall?.siteUrl, selectedMall?.memo, selectedMall?.enabled]);

  const addGeneratedFile = useCallback((historyItem: ConversionHistoryItem) => {
    setHistory((prev) => [
      historyItem,
      ...prev.filter((item) => item.id !== historyItem.id).slice(0, MAX_HISTORY_ITEMS - 1),
    ]);
    void saveGeneratedOrderFile(historyItem).catch(() => {
      toast.error('생성 파일 목록 저장 실패');
    });
  }, []);

  const collectBrowserMall = useMemo(
    () => createBrowserMallCollector({ mallAccounts, addGeneratedFile, setPreviewId }),
    [addGeneratedFile, mallAccounts],
  );

  const selectFile = (file: File | null) => {
    setSelectedFile(file);
    setError(null);
    setState(file ? 'ready' : 'idle');
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0] ?? null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  };

  const handleConvert = async () => {
    if (!selectedFile) return;
    setState('converting');
    setError(null);

    try {
      const { convertIcecreamMallOrderFile } = await import('./lib/order-collection-api');
      const result = await convertIcecreamMallOrderFile(selectedFile, filePassword || undefined);
      const convertedAt = Date.now();
      const historyItem = {
        ...result,
        id: `${convertedAt}-${selectedFile.name}`,
        sourceName: selectedFile.name.normalize('NFC'),
        convertedAt,
        collectionDate: todayYmd(),
        collectionMode: 'manual-upload' as const,
        mallKey: ICECREAM_MALL_KEY,
        mallName: '아이스크림몰',
      };
      addGeneratedFile(historyItem);
      setPreviewId(historyItem.id);
      setState('success');
      toast.success('주문수집 엑셀 변환 완료');
      if (inputRef.current) inputRef.current.value = '';
      setSelectedFile(null);
      setFilePassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '변환 실패';
      setError(message);
      setState('error');
      toast.error(message);
    }
  };

  const handleBrowserCollectAll = async () => {
    const enabledAccounts = mallAccounts.filter((account) => account.enabled);
    const collectableAccounts = enabledAccounts.filter(isBrowserCollectableMall);
    const pendingCount = enabledAccounts.length - collectableAccounts.length;

    if (collectableAccounts.length === 0) {
      toast.error('현재 자동 수집 가능한 몰 계정이 없습니다.');
      return;
    }

    setBrowserCollecting(true);
    setState('converting');
    setError(null);

    try {
      for (const account of collectableAccounts) {
        setCollectingMallKey(account.key);
        const collected = await collectBrowserMall(account);
        if (collected.masked) {
          toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
        }
      }
      setState('success');
      toast.success(
        pendingCount > 0
          ? `자동 수집 완료. ${formatNumber(pendingCount)}개 몰은 준비 중입니다.`
          : '전체 수집 완료',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '브라우저 수집 실패';
      setError(message);
      setState('error');
      toast.error(message);
    } finally {
      setBrowserCollecting(false);
      setCollectingMallKey(null);
    }
  };

  const handleBrowserCollectMall = async (account: OrderCollectionMallAccount) => {
    if (!account.enabled) {
      toast.error(`${account.name} 계정이 중지되어 있습니다.`);
      return;
    }
    if (!isBrowserCollectableMall(account)) {
      toast.error(
        account.configured
          ? `${account.name} 자동 수집은 준비 중입니다.`
          : `${account.name} 계정을 먼저 설정해주세요.`,
      );
      return;
    }

    setCollectingMallKey(account.key);
    setState('converting');
    setError(null);

    try {
      const collected = await collectBrowserMall(account);
      setState('success');
      if (collected.masked) {
        toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
      }
      toast.success(`${account.name} 수집 완료`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '브라우저 수집 실패';
      setError(message);
      setState('error');
      toast.error(message);
    } finally {
      setCollectingMallKey(null);
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
      const message = err instanceof Error ? err.message : '저장된 비밀번호를 불러오지 못했습니다.';
      toast.error(message);
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
    await saveMallAccountMutation.mutateAsync({
      mallKey: selectedMall.key,
      input: {
        loginId: mallDraft.loginId,
        password: mallDraft.password.trim() ? mallDraft.password : undefined,
        siteUrl: mallDraft.siteUrl,
        memo: mallDraft.memo,
        enabled: mallDraft.enabled,
      },
    }).catch(() => undefined);
  };

  const handleOpenMall = () => {
    if (!mallDraft.siteUrl) return;
    window.open(mallDraft.siteUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendToSellpia = async (item: ConversionHistoryItem) => {
    setSellpiaSendingId(item.id);
    try {
      const shopName = item.mallName ?? '아이스크림몰';
      const result = await sendOrderFileToSellpiaViaExtension({
        shopName,
        fileName: item.fileName,
        blob: item.blob,
      });
      toast.success(`셀피아 전송 완료 — ${result.shop ?? shopName} 주문접수 클릭`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '셀피아 전송 실패';
      toast.error(message);
    } finally {
      setSellpiaSendingId(null);
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
            <div className="text-sm text-slate-500">여러 몰 주문을 수집해 셀피아 납품 양식으로 변환합니다</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Upload size={16} />
          파일 선택
        </button>
      </div>

      <OrderCollectionFlow
        orderCount={lastOrderCount}
        productRows={lastResult?.productRows ?? null}
        outputRows={lastResult?.outputRows ?? null}
        skippedRows={lastResult?.skippedRows ?? null}
      />

      <OrderCollectionDailyPanel
        collectingMallKey={collectingMallKey}
        mallAccounts={mallAccounts}
        selectedMallKey={selectedMallKey}
        summary={orderCollectionSummary}
      />

      <MallAccountSection
        browserCollecting={browserCollecting}
        collectingMallKey={collectingMallKey}
        configuredMallCount={configuredMallCount}
        conversionState={state}
        enabledMallCount={enabledMallCount}
        mallAccounts={mallAccounts}
        mallCollectionStats={orderCollectionSummary.mallStatsByKey}
        mallDraft={mallDraft}
        mallError={mallError}
        mallLoading={mallLoading}
        mallPasswordLoading={mallPasswordLoading}
        mallPasswordVisible={mallPasswordVisible}
        mallSaving={mallSaving}
        mallSettingsOpen={mallSettingsOpen}
        selectedMall={selectedMall}
        onCollectAll={() => void handleBrowserCollectAll()}
        onCollectMall={(account) => void handleBrowserCollectMall(account)}
        onDraftChange={setMallDraft}
        onOpenMall={handleOpenMall}
        onOpenSettings={(account) => void handleOpenMallSettings(account)}
        onPasswordVisibleChange={setMallPasswordVisible}
        onRefresh={refreshMallAccounts}
        onSaveMallAccount={() => void handleSaveMallAccount()}
        onSettingsOpenChange={handleMallSettingsOpenChange}
      />

      <ManualUploadSection
        canConvert={canConvert}
        dragActive={dragActive}
        error={error}
        filePassword={filePassword}
        inputRef={inputRef}
        lastResult={lastResult}
        selectedFile={selectedFile}
        state={state}
        onConvert={() => void handleConvert()}
        onDownload={downloadOrderCollectionFile}
        onDragActiveChange={setDragActive}
        onDrop={handleDrop}
        onFilePasswordChange={setFilePassword}
        onInputChange={handleInputChange}
        onPreview={setPreviewId}
      />

      {previewItem && (
        <FilePreviewSection
          item={previewItem}
          onClose={() => setPreviewId(null)}
          onDownload={downloadOrderCollectionFile}
        />
      )}

      <GeneratedFilesSection
        groups={generatedFileGroups}
        sellpiaSendingId={sellpiaSendingId}
        onDownload={downloadOrderCollectionFile}
        onPreview={setPreviewId}
        onSendToSellpia={(item) => void handleSendToSellpia(item)}
      />
    </div>
  );
}
