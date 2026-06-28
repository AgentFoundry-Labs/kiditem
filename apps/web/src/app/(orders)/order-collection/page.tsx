'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Save,
  Send,
  Store,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  convertIcecreamMallOrderFile,
  convertIcecreamMallOrderRows,
  downloadOrderCollectionFile,
} from './lib/order-collection-api';
import {
  collectIcecreamMallRowsFromExtension,
  sendOrderFileToSellpiaViaExtension,
} from './lib/order-collection-extension';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
} from './lib/order-mall-account-api';
import {
  loadGeneratedOrderFiles,
  saveGeneratedOrderFile,
  type StoredOrderCollectionFile,
} from './lib/order-generated-file-store';
import { buildOrderCollectionSummary } from './lib/order-collection-stats';
import { OrderCollectionDailyPanel } from './components/OrderCollectionDailyPanel';
import { OrderCollectionFlow } from './components/OrderCollectionFlow';

type ConversionState = 'idle' | 'ready' | 'converting' | 'success' | 'error';

type ConversionHistoryItem = StoredOrderCollectionFile;

interface MallAccountDraft {
  loginId: string;
  password: string;
  siteUrl: string;
  memo: string;
  enabled: boolean;
}

const ACCEPTED_EXTENSIONS = '.txt,.tsv,.csv,.xls,.xlsx';
const ICECREAM_MALL_KEY = 'icecream-mall';
const MAX_HISTORY_ITEMS = 1000;
const MALL_ACCOUNT_GRID_CLASS =
  'grid min-w-[760px] grid-cols-[minmax(150px,1.6fr)_minmax(96px,1fr)_80px_112px_88px_148px] gap-2';

const EMPTY_MALL_DRAFT: MallAccountDraft = {
  loginId: '',
  password: '',
  siteUrl: '',
  memo: '',
  enabled: true,
};

export default function OrderCollectionPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [state, setState] = useState<ConversionState>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<ConversionHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filePassword, setFilePassword] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [mallAccounts, setMallAccounts] = useState<OrderCollectionMallAccount[]>([]);
  const [mallLoading, setMallLoading] = useState(true);
  const [mallSaving, setMallSaving] = useState(false);
  const [browserCollecting, setBrowserCollecting] = useState(false);
  const [collectingMallKey, setCollectingMallKey] = useState<string | null>(null);
  const [mallError, setMallError] = useState<string | null>(null);
  const [selectedMallKey, setSelectedMallKey] = useState<string | null>(ICECREAM_MALL_KEY);
  const [mallDraft, setMallDraft] = useState<MallAccountDraft>(EMPTY_MALL_DRAFT);
  const [mallSettingsOpen, setMallSettingsOpen] = useState(false);
  const [mallPasswordLoading, setMallPasswordLoading] = useState(false);
  const [mallPasswordVisible, setMallPasswordVisible] = useState(false);
  const [sellpiaSendingId, setSellpiaSendingId] = useState<string | null>(null);

  const canConvert = selectedFile !== null && state !== 'converting';
  const lastResult = history[0] ?? null;
  const previewItem = previewId ? history.find((item) => item.id === previewId) ?? null : null;
  const defaultMall =
    mallAccounts.find((account) => account.key === ICECREAM_MALL_KEY) ?? mallAccounts[0] ?? null;
  const selectedMall =
    mallAccounts.find((account) => account.key === selectedMallKey) ?? defaultMall;
  const configuredMallCount = mallAccounts.filter((account) => account.configured).length;
  const enabledMallCount = mallAccounts.filter((account) => account.configured && account.enabled).length;
  const lastOrderCount = getOrderCount(lastResult);

  const generatedFileGroups = useMemo(() => groupHistoryByDay(history), [history]);
  const orderCollectionSummary = useMemo(() => buildOrderCollectionSummary(history), [history]);
  const mallCollectionStats = orderCollectionSummary.mallStatsByKey;

  const loadMallAccounts = async () => {
    setMallLoading(true);
    setMallError(null);
    try {
      const accounts = await orderMallAccountApi.list();
      setMallAccounts(accounts);
      setSelectedMallKey(
        (current) =>
          current ?? accounts.find((account) => account.key === ICECREAM_MALL_KEY)?.key ?? accounts[0]?.key ?? null,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '몰 계정을 불러오지 못했습니다.';
      setMallError(message);
    } finally {
      setMallLoading(false);
    }
  };

  useEffect(() => {
    void loadMallAccounts();
  }, []);

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
      const result = await convertIcecreamMallOrderFile(selectedFile, filePassword || undefined);
      const historyItem = {
        ...result,
        id: `${Date.now()}-${selectedFile.name}`,
        sourceName: selectedFile.name.normalize('NFC'),
        convertedAt: Date.now(),
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

  const addGeneratedFile = (historyItem: ConversionHistoryItem) => {
    setHistory((prev) => [
      historyItem,
      ...prev.filter((item) => item.id !== historyItem.id).slice(0, MAX_HISTORY_ITEMS - 1),
    ]);
    void saveGeneratedOrderFile(historyItem).catch(() => {
      toast.error('생성 파일 목록 저장 실패');
    });
  };

  const collectBrowserMall = async (account: OrderCollectionMallAccount) => {
    if (!isBrowserCollectableMall(account)) {
      throw new Error(`${account.name} 자동 수집은 준비 중입니다.`);
    }

    const credentials = await loadMallLoginCredentials(account);
    const collected = await collectIcecreamMallRowsFromExtension(todayYmd(), credentials);
    const result = await convertIcecreamMallOrderRows({
      headers: collected.headers,
      rows: collected.rows,
      fileName: `아이스크림몰_${collected.date ?? todayYmd()}_브라우저수집`,
    });
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-${account.key}-browser`,
      sourceName: `${account.name} 브라우저 수집 (${formatNumber(collected.rowCount)}행)`,
      convertedAt,
      collectionDate: collected.date ?? todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: collected.rowCount,
      mallKey: account.key,
      mallName: account.name,
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);

    return collected;
  };

  const handleBrowserCollectAll = async () => {
    const enabledAccounts = mallAccounts.filter((account) => account.configured && account.enabled);
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
    if (!account.configured) {
      toast.error(`${account.name} 계정을 먼저 설정해주세요.`);
      return;
    }
    if (!account.enabled) {
      toast.error(`${account.name} 계정이 중지되어 있습니다.`);
      return;
    }
    if (!isBrowserCollectableMall(account)) {
      toast.error(`${account.name} 자동 수집은 준비 중입니다.`);
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
    setMallSaving(true);
    try {
      const saved = await orderMallAccountApi.update(selectedMall.key, {
        loginId: mallDraft.loginId,
        password: mallDraft.password.trim() ? mallDraft.password : undefined,
        siteUrl: mallDraft.siteUrl,
        memo: mallDraft.memo,
        enabled: mallDraft.enabled,
      });
      setMallAccounts((prev) =>
        prev.map((account) => (account.key === saved.key ? saved : account)),
      );
      setMallDraft((current) => ({ ...current, password: '' }));
      setMallSettingsOpen(false);
      toast.success(`${saved.name} 계정 저장 완료`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '몰 계정 저장 실패';
      toast.error(message);
    } finally {
      setMallSaving(false);
    }
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
              onClick={() => void handleBrowserCollectAll()}
              disabled={
                mallLoading ||
                browserCollecting ||
                collectingMallKey !== null ||
                state === 'converting' ||
                enabledMallCount === 0
              }
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {browserCollecting ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              전체 수집
            </button>
            <button
              type="button"
              onClick={() => void loadMallAccounts()}
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
                        onClick={() => void handleOpenMallSettings(account)}
                        className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        설정
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleBrowserCollectMall(account)}
                        disabled={
                          browserCollecting ||
                          collectingMallKey !== null ||
                          state === 'converting' ||
                          !collectable
                        }
                        title={collectable ? `${account.name} 개별 수집` : '자동 수집 준비 중'}
                        className="inline-flex min-w-[52px] items-center justify-center rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {isCollectingAccount ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          '수집'
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <Dialog.Root open={mallSettingsOpen} onOpenChange={handleMallSettingsOpenChange}>
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
                    checked={mallDraft.enabled}
                    onChange={(event) =>
                      setMallDraft((current) => ({ ...current, enabled: event.target.checked }))
                    }
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
                    value={mallDraft.siteUrl}
                    onChange={(event) =>
                      setMallDraft((current) => ({ ...current, siteUrl: event.target.value }))
                    }
                    disabled={!selectedMall || mallSaving}
                    placeholder="https://"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleOpenMall}
                    disabled={!mallDraft.siteUrl}
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
                  value={mallDraft.loginId}
                  onChange={(event) =>
                    setMallDraft((current) => ({ ...current, loginId: event.target.value }))
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
                    type={mallPasswordVisible ? 'text' : 'password'}
                    value={mallDraft.password}
                    onChange={(event) =>
                      setMallDraft((current) => ({ ...current, password: event.target.value }))
                    }
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
                    onClick={() => setMallPasswordVisible((visible) => !visible)}
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
                  value={mallDraft.memo}
                  onChange={(event) =>
                    setMallDraft((current) => ({ ...current, memo: event.target.value }))
                  }
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
                  onClick={() => void handleSaveMallAccount()}
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

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">수동 업로드</div>
            <div className="text-xs text-slate-500">업로드된 상품 주문 행 전체를 납품 양식으로 변환</div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            아이스크림몰
          </span>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={cn(
              'flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed px-5 py-6 text-center transition-colors',
              dragActive ? 'border-purple-400 bg-purple-50' : 'border-slate-300 bg-slate-50/70',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleInputChange}
              className="hidden"
            />
            <FileSpreadsheet size={34} className="text-slate-400" />
            <div className="mt-3 text-sm font-medium text-slate-900">
              {selectedFile ? selectedFile.name : '주문 파일'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {selectedFile ? fileSizeLabel(selectedFile.size) : ACCEPTED_EXTENSIONS}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={state === 'converting'}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Upload size={15} />
                선택
              </button>
              <button
                type="button"
                onClick={handleConvert}
                disabled={!canConvert}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === 'converting' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                변환
              </button>
            </div>
            <label className="mt-4 w-full max-w-sm text-left">
              <span className="text-xs font-medium text-slate-600">파일 비밀번호</span>
              <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-slate-400">
                <LockKeyhole size={15} className="shrink-0 text-slate-400" />
                <input
                  type="password"
                  value={filePassword}
                  onChange={(event) => setFilePassword(event.target.value)}
                  disabled={state === 'converting'}
                  placeholder="비밀번호가 있을 때 입력"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50"
                />
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              {stateIcon(state)}
              상태
            </div>
            <div className="mt-3 text-sm text-slate-600">{stateMessage(state, selectedFile, error)}</div>
            {lastResult && (
              <div className="mt-4 rounded-md bg-white p-3 text-xs text-slate-600">
                <div className="break-words font-medium text-slate-900">{lastResult.fileName}</div>
                <div className="mt-1 flex items-center gap-1">
                  <Clock size={12} />
                  {formatDateTime(lastResult.convertedAt)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadOrderCollectionFile(lastResult)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download size={13} />
                    다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewId(lastResult.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Eye size={13} />
                    미리보기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {previewItem && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">파일 미리보기</div>
              <div className="mt-1 max-w-full truncate text-xs text-slate-500">{previewItem.fileName}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadOrderCollectionFile(previewItem)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download size={15} />
                다운로드
              </button>
              <button
                type="button"
                onClick={() => setPreviewId(null)}
                aria-label="미리보기 닫기"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <PreviewTable rows={previewItem.previewRows} />
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">생성 파일</div>
        </div>
        {generatedFileGroups.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">생성된 파일이 없습니다.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {generatedFileGroups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center justify-between bg-slate-50 px-5 py-3">
                  <div className="text-xs font-semibold text-slate-600">{group.label}</div>
                  <div className="text-xs tabular-nums text-slate-400">{formatNumber(group.items.length)}개</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">몰/원본</th>
                        <th className="px-4 py-3 text-left font-medium">파일명</th>
                        <th className="px-4 py-3 text-right font-medium">상품</th>
                        <th className="px-4 py-3 text-right font-medium">출력</th>
                        <th className="px-4 py-3 text-left font-medium">생성시각</th>
                        <th className="px-4 py-3 text-right font-medium">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="max-w-[260px] truncate px-4 py-3 text-slate-700">{item.sourceName}</td>
                          <td className="max-w-[320px] truncate px-4 py-3 font-medium text-slate-900">
                            {item.fileName}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {countLabel(item.productRows)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {countLabel(item.outputRows)}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{formatDateTime(item.convertedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => void handleSendToSellpia(item)}
                                disabled={sellpiaSendingId === item.id}
                                className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {sellpiaSendingId === item.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Send size={13} />
                                )}
                                셀피아 전송
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewId(item.id)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Eye size={13} />
                                미리보기
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadOrderCollectionFile(item)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Download size={13} />
                                다운로드
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PreviewTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) {
    return <div className="px-5 py-8 text-center text-sm text-slate-400">미리볼 데이터가 없습니다.</div>;
  }

  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="min-w-max border-separate border-spacing-0 text-xs">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? 'sticky top-0 z-10 bg-slate-100' : 'bg-white'}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  className={cn(
                    'max-w-[260px] border-b border-r border-slate-100 px-3 py-2 text-left align-top text-slate-700',
                    rowIndex === 0 && 'font-semibold text-slate-900',
                    cellIndex === 0 && 'border-l',
                  )}
                >
                  <div className="truncate" title={cell}>
                    {cell || '-'}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function stateIcon(state: ConversionState) {
  if (state === 'converting') return <Loader2 size={15} className="animate-spin text-purple-600" />;
  if (state === 'success') return <CheckCircle2 size={15} className="text-emerald-600" />;
  if (state === 'error') return <AlertCircle size={15} className="text-red-600" />;
  return <Clock size={15} className="text-slate-500" />;
}

function stateMessage(state: ConversionState, file: File | null, error: string | null): string {
  if (state === 'converting') return '변환 중';
  if (state === 'success') return '다운로드 완료';
  if (state === 'error') return error ?? '변환 실패';
  if (file) return '변환 대기';
  return '파일 대기';
}

function countLabel(value: number | null): string {
  return value === null ? '-' : formatNumber(value);
}

function getOrderCount(result: ConversionHistoryItem | null): number | null {
  if (!result || result.outputRows === null || result.productRows === null) return null;
  const orderCount = result.outputRows - result.productRows;
  return orderCount >= 0 ? orderCount : null;
}

function groupHistoryByDay(items: ConversionHistoryItem[]): Array<{
  key: string;
  label: string;
  items: ConversionHistoryItem[];
}> {
  const groups: Array<{ key: string; label: string; items: ConversionHistoryItem[] }> = [];
  const byKey = new Map<string, { key: string; label: string; items: ConversionHistoryItem[] }>();

  for (const item of items) {
    const key = item.collectionDate ?? dayKey(item.convertedAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: dayLabel(key), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

function fileSizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function mallStatus(account: OrderCollectionMallAccount): { label: string; tone: 'empty' | 'paused' | 'ready' } {
  if (!account.configured) return { label: '미설정', tone: 'empty' };
  if (!account.enabled) return { label: '중지', tone: 'paused' };
  return { label: '사용', tone: 'ready' };
}

function isBrowserCollectableMall(account: OrderCollectionMallAccount): boolean {
  return account.key === ICECREAM_MALL_KEY && account.configured && account.enabled;
}

async function loadMallLoginCredentials(account: OrderCollectionMallAccount) {
  if (!account.loginId || !account.hasPassword) {
    throw new Error(`${account.name} 계정 ID와 비밀번호를 먼저 저장해주세요.`);
  }

  const result = await orderMallAccountApi.password(account.key);
  if (!result.password) {
    throw new Error(`${account.name} 저장된 비밀번호를 불러오지 못했습니다.`);
  }

  return {
    loginId: account.loginId,
    password: result.password,
  };
}

function formatMallCollectionTime(timestamp: number): string {
  const value = new Date(timestamp);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}

function draftFromMallAccount(account: OrderCollectionMallAccount): MallAccountDraft {
  return {
    loginId: account.loginId ?? '',
    password: '',
    siteUrl: account.siteUrl ?? '',
    memo: account.memo ?? '',
    enabled: account.enabled,
  };
}

function todayYmd(): string {
  const now = new Date();
  return dayKey(now.getTime());
}

function dayKey(timestamp: number): string {
  const now = new Date(timestamp);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayLabel(key: string): string {
  const [year, month, day] = key.split('-');
  return `${year}. ${month}. ${day}.`;
}
