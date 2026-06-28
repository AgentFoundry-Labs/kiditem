'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
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
import { friendlyError } from '@/lib/api-error';
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
import { OrderActivityFeed } from './components/OrderActivityFeed';
import { OrderCollectionDailyPanel } from './components/OrderCollectionDailyPanel';
import { OrderUploadModal } from './components/OrderUploadModal';
import {
  addSeenOrderKeys,
  diffNewOrderRows,
  loadSeenOrderKeys,
  rowKeysOf,
} from './lib/order-detect';

type ConversionState = 'idle' | 'ready' | 'converting' | 'success' | 'error';

type ConversionHistoryItem = StoredOrderCollectionFile;

interface MallAccountDraft {
  loginId: string;
  password: string;
  siteUrl: string;
  memo: string;
  enabled: boolean;
}

interface MallCollectionStat {
  orderRows: number;
  productRows: number;
  latestAt: number;
}

const ICECREAM_MALL_KEY = 'icecream-mall';
const MAX_HISTORY_ITEMS = 1000;
const DEFAULT_AUTO_INTERVAL_MIN = 30;
const AUTO_INTERVAL_OPTIONS_MIN = [5, 10, 15, 30, 60];

const MALL_LABELS: Record<string, string> = {
  'one-polaris': '원폴라리스',
  'icecream-mall': '아이스크림몰',
  kidkids: '키드키즈',
  kidsnote: '키즈노트',
  'haebub-mall': '해법몰',
  onch: '온채널',
  kkomangse: '꼬망세',
  art09: '아트공구',
  'tekville-edu': '테크빌교육',
  'benepia-mul': '베네피아물',
};

const EMPTY_MALL_DRAFT: MallAccountDraft = {
  loginId: '',
  password: '',
  siteUrl: '',
  memo: '',
  enabled: true,
};

export default function OrderCollectionPage() {
  const [state, setState] = useState<ConversionState>('idle');
  const [history, setHistory] = useState<ConversionHistoryItem[]>([]);
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
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [autoLastRunAt, setAutoLastRunAt] = useState<number | null>(null);
  const [autoNextRunAt, setAutoNextRunAt] = useState<number | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoIntervalMin, setAutoIntervalMin] = useState(DEFAULT_AUTO_INTERVAL_MIN);
  const autoBusyRef = useRef(false);
  const autoDetectRef = useRef<() => Promise<void>>(async () => {});

  const autoIntervalMs = autoIntervalMin * 60 * 1000;
  const previewItem = previewId ? history.find((item) => item.id === previewId) ?? null : null;
  const defaultMall =
    mallAccounts.find((account) => account.key === ICECREAM_MALL_KEY) ?? mallAccounts[0] ?? null;
  const selectedMall =
    mallAccounts.find((account) => account.key === selectedMallKey) ?? defaultMall;
  const configuredMallCount = mallAccounts.filter((account) => account.configured).length;
  const enabledMallCount = mallAccounts.filter((account) => account.configured && account.enabled).length;

  const collectionSummary = useMemo(() => {
    const today = todayYmd();
    let totalOrders = 0;
    let todayOrders = 0;
    let latestAt = 0;
    for (const item of history) {
      const orders = getOrderCount(item) ?? 0;
      totalOrders += orders;
      if ((item.collectionDate ?? '') === today) todayOrders += orders;
      latestAt = Math.max(latestAt, item.convertedAt);
    }
    return { totalOrders, todayOrders, latestAt };
  }, [history]);

  const generatedFileGroups = useMemo(() => groupHistoryByDay(history), [history]);
  const mallCollectionStats = useMemo(() => buildMallCollectionStats(history), [history]);
  const pendingSellpiaCount = history.filter((item) => !item.sentAt).length;

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
      const message = orderCollectionError(err, '몰 계정을 불러오지 못했습니다.');
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
    addSeenOrderKeys(account.key, rowKeysOf(collected.rows));

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
      const message = orderCollectionError(err, '브라우저 수집 실패');
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

    try {
      const collected = await collectBrowserMall(account);
      setState('success');
      if (collected.masked) {
        toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
      }
      toast.success(`${account.name} 수집 완료`);
    } catch (err) {
      const message = orderCollectionError(err, '브라우저 수집 실패');
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
      const message = orderCollectionError(err, '저장된 비밀번호를 불러오지 못했습니다.');
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
      const message = orderCollectionError(err, '몰 계정 저장 실패');
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
      const sentAt = Date.now();
      setHistory((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, sentAt } : entry)));
      void saveGeneratedOrderFile({ ...item, sentAt }).catch(() => {});
      toast.success(`셀피아 전송 완료 — ${result.shop ?? shopName} 주문접수 클릭`);
    } catch (err) {
      const message = orderCollectionError(err, '셀피아 전송 실패');
      toast.error(message);
    } finally {
      setSellpiaSendingId(null);
    }
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
    if (mall.key !== ICECREAM_MALL_KEY) {
      throw new Error(`${mall.name} 변환은 아직 준비 중입니다. 현재는 아이스크림몰만 변환됩니다.`);
    }
    const result = await convertIcecreamMallOrderFile(file, password);
    const historyItem = {
      ...result,
      id: `${Date.now()}-${file.name}`,
      sourceName: file.name.normalize('NFC'),
      convertedAt: Date.now(),
      collectionDate: todayYmd(),
      collectionMode: 'manual-upload' as const,
      mallKey: mall.key,
      mallName: mall.name,
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    toast.success(`${mall.name} 변환 완료`);
  };

  // 30분 간격 신규 주문 자동 감지: 수집한 행을 '이미 본 주문'과 비교해 신규만 생성 파일에 추가.
  const runAutoDetect = async () => {
    if (autoBusyRef.current) return;
    const targets = mallAccounts.filter(isBrowserCollectableMall);
    if (targets.length === 0) return;
    autoBusyRef.current = true;
    setAutoRunning(true);
    try {
      for (const account of targets) {
        try {
          const credentials = await loadMallLoginCredentials(account);
          const collected = await collectIcecreamMallRowsFromExtension(todayYmd(), credentials);
          const diff = diffNewOrderRows(
            collected.headers,
            collected.rows,
            loadSeenOrderKeys(account.key),
          );
          if (diff.newRows.length === 0) continue;
          const result = await convertIcecreamMallOrderRows(
            {
              headers: collected.headers,
              rows: diff.newRows,
              fileName: `${account.name}_${collected.date ?? todayYmd()}_자동감지`,
            },
            { download: false },
          );
          const convertedAt = Date.now();
          addGeneratedFile({
            ...result,
            id: `${convertedAt}-${account.key}-auto`,
            sourceName: `${account.name} 자동감지 신규 ${formatNumber(diff.newOrderCount)}건`,
            convertedAt,
            collectionDate: collected.date ?? todayYmd(),
            collectionMode: 'browser' as const,
            collectedRows: diff.newRows.length,
            mallKey: account.key,
            mallName: account.name,
          });
          addSeenOrderKeys(account.key, diff.newRowKeys);
          toast.success(`${account.name} 새 주문 ${formatNumber(diff.newOrderCount)}건 감지`);
        } catch (err) {
          console.warn('[order-auto-detect]', account.key, err);
        }
      }
      setAutoLastRunAt(Date.now());
    } finally {
      autoBusyRef.current = false;
      setAutoRunning(false);
    }
  };

  const toggleAutoDetect = () => {
    const next = !autoDetect;
    setAutoDetect(next);
    setAutoNextRunAt(next ? Date.now() + autoIntervalMs : null);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('kiditem-order-auto-detect', next ? '1' : '0');
    }
    if (next) void runAutoDetect();
  };

  const handleAutoIntervalChange = (minutes: number) => {
    setAutoIntervalMin(minutes);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('kiditem-order-auto-interval', String(minutes));
    }
    if (autoDetect) setAutoNextRunAt(Date.now() + minutes * 60 * 1000);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedMin = Number(window.localStorage.getItem('kiditem-order-auto-interval'));
    const intervalMin = AUTO_INTERVAL_OPTIONS_MIN.includes(savedMin) ? savedMin : DEFAULT_AUTO_INTERVAL_MIN;
    setAutoIntervalMin(intervalMin);
    if (window.localStorage.getItem('kiditem-order-auto-detect') === '1') {
      setAutoDetect(true);
      setAutoNextRunAt(Date.now() + intervalMin * 60 * 1000);
    }
  }, []);

  // 타이머가 항상 최신 runAutoDetect 를 부르도록 ref 갱신 (stale closure 방지).
  useEffect(() => {
    autoDetectRef.current = runAutoDetect;
  });

  // 카운트다운(autoNextRunAt)이 끝나면 한 번 실행하고 다음 30분 뒤로 재예약.
  useEffect(() => {
    if (!autoDetect || autoNextRunAt === null) return;
    const delay = Math.max(0, autoNextRunAt - Date.now());
    const timer = window.setTimeout(() => {
      void autoDetectRef.current().finally(() => {
        setAutoNextRunAt(Date.now() + autoIntervalMs);
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [autoDetect, autoNextRunAt, autoIntervalMs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <FileSpreadsheet size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">주문 수집</h1>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="text-xs font-medium text-slate-500">오늘 주문</div>
          <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {formatNumber(collectionSummary.todayOrders)}
          </div>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-5 py-4">
          <div className="text-xs font-medium text-purple-700">셀피아 전송 대기</div>
          <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-purple-700">
            {formatNumber(pendingSellpiaCount)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="text-xs font-medium text-slate-500">사용 몰</div>
          <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {formatNumber(enabledMallCount)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="text-xs font-medium text-slate-500">누적 주문</div>
          <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {formatNumber(collectionSummary.totalOrders)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        <div className="min-w-0 xl:col-span-3">
          <OrderCollectionDailyPanel history={history} />
        </div>
        <OrderActivityFeed className="min-h-[430px] max-h-[460px] xl:col-span-1" history={history} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Store size={18} className="text-slate-500" />
            <div>
              <div className="text-sm font-semibold text-slate-900">주문수집</div>
              <div className="text-xs text-slate-500">
                {formatNumber(configuredMallCount)} / {formatNumber(mallAccounts.length)} 계정
                {autoDetect ? ` · 자동감지 ${autoIntervalMin}분` : ''}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {autoLastRunAt !== null && (
              <span className="hidden text-xs tabular-nums text-slate-400 sm:inline">
                자동감지 {formatMallCollectionTime(autoLastRunAt)}
              </span>
            )}
            <button
              type="button"
              onClick={toggleAutoDetect}
              title="설정한 간격마다 새 주문을 자동 감지합니다 (이 페이지가 열려 있을 때)"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                autoDetect
                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full', autoDetect ? 'bg-purple-600' : 'bg-slate-300')}
              />
              자동감지
            </button>
            <select
              value={autoIntervalMin}
              onChange={(event) => handleAutoIntervalChange(Number(event.target.value))}
              title="자동 감지 간격"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-600 outline-none hover:bg-slate-50 focus:border-slate-400"
            >
              {AUTO_INTERVAL_OPTIONS_MIN.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes}분
                </option>
              ))}
            </select>
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
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[minmax(150px,1.6fr)_minmax(96px,1fr)_80px_112px_88px_148px] gap-2 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <div>몰</div>
              <div>ID</div>
              <div className="text-right">주문</div>
              <div className="text-center">다음 감지</div>
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
                      'grid grid-cols-[minmax(150px,1.6fr)_minmax(96px,1fr)_80px_112px_88px_148px] items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm',
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
                      className="text-right tabular-nums"
                      title={collectionStat ? `상품 행 ${formatNumber(collectionStat.productRows)}개` : undefined}
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {formatNumber(collectionStat?.orderRows ?? 0)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {collectionStat ? formatMallCollectionTime(collectionStat.latestAt) : '-'}
                      </div>
                    </div>
                    <div className="flex justify-center">
                      {autoDetect && collectable && autoNextRunAt !== null ? (
                        <AutoDetectCountdown
                          targetAt={autoNextRunAt}
                          totalMs={autoIntervalMs}
                          running={autoRunning}
                        />
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
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

function AutoDetectCountdown({
  targetAt,
  totalMs,
  running,
}: {
  targetAt: number;
  totalMs: number;
  running: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, targetAt - now);
  const progress = Math.max(0, Math.min(1, remaining / totalMs));
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const label = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <span className="inline-flex items-center gap-1.5" title="다음 자동 감지까지 남은 시간">
      {running ? (
        <Loader2 size={16} className="animate-spin text-purple-600" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" className="-rotate-90">
          <circle cx="12" cy="12" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="#9333ea"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
      )}
      <span className={cn('text-xs tabular-nums', running ? 'text-purple-600' : 'text-slate-500')}>
        {running ? '감지 중' : label}
      </span>
    </span>
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

function buildMallCollectionStats(items: ConversionHistoryItem[]): Map<string, MallCollectionStat> {
  const stats = new Map<string, MallCollectionStat>();

  for (const item of items) {
    const mallKey = resolveHistoryMallKey(item);
    if (!mallKey) continue;

    const current = stats.get(mallKey) ?? {
      orderRows: 0,
      productRows: 0,
      latestAt: item.convertedAt,
    };

    current.orderRows += getOrderCount(item) ?? 0;
    current.productRows += item.productRows ?? 0;
    current.latestAt = Math.max(current.latestAt, item.convertedAt);
    stats.set(mallKey, current);
  }

  return stats;
}

function resolveHistoryMallKey(item: ConversionHistoryItem): string | null {
  if (item.mallKey) return item.mallKey;

  const searchable = `${item.mallName ?? ''} ${item.sourceName} ${item.fileName}`.toLowerCase();
  for (const [key, label] of Object.entries(MALL_LABELS)) {
    if (searchable.includes(key.toLowerCase()) || searchable.includes(label.toLowerCase())) {
      return key;
    }
  }

  return null;
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

function orderCollectionError(err: unknown, fallback: string): string {
  const message = friendlyError(err) ?? fallback;
  return message === 'Failed to fetch'
    ? 'API 서버에 연결하지 못했습니다. 백엔드 실행 상태 또는 브라우저 접속 주소를 확인해주세요.'
    : message;
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
