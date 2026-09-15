'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { useRocketChannelAccounts } from '@/hooks/useRocketChannelAccounts';
import { useAllMarketplaceOrderCollection } from '@/hooks/useAllMarketplaceOrderCollection';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { FilePreviewSection } from './FilePreviewSection';
import {
  GeneratedFilesSection,
  type GeneratedFilesBulkAction,
} from './GeneratedFilesSection';
import { MallAccountSection } from './MallAccountSection';
import { OrderActivityFeed } from './OrderActivityFeed';
import { OrderCollectionDailyPanel } from './OrderCollectionDailyPanel';
import { OrderCollectionPipeline } from './OrderCollectionPipeline';
import { OrderUploadModal } from './OrderUploadModal';
import { useOrderActivityEvents } from '../hooks/use-order-activity-events';
import {
  AUTO_INTERVAL_OPTIONS_MIN,
  useOrderAutoDetect,
} from '../hooks/use-order-auto-detect';
import { useSellpiaOrderTransmission } from '../hooks/use-sellpia-order-transmission';
import { useSellpiaShipmentTrackingSourceOwner } from '../hooks/use-sellpia-shipment-tracking-source-owner';
import type { SellpiaReconcileResult } from '../lib/sellpia-order-reconcile';
import { createGeneratedFileActionLock } from '../lib/generated-file-action-lock';
import { isDuplicateGeneratedFile } from '../lib/generated-file-dedup';
import { downloadOrderCollectionFile } from '../lib/order-collection-download';
import { type OrderCollectionExtensionRun } from '../lib/order-collection-extension';
import { MallCollectionControl } from './MallCollectionControl';
import { SellpiaShipmentTrackingControl } from './SellpiaShipmentTrackingControl';
import {
  collectionAttentionNotice,
  ICECREAM_MALL_KEY,
  MAX_HISTORY_ITEMS,
  EMPTY_MALL_DRAFT,
  draftFromMallAccount,
  isBrowserCollectableMall,
  hasSellpiaTransmissionRequest,
  mallCollectionFailureMessage,
  orderCollectionBatchNotice,
  todayYmd,
  type ConversionHistoryItem,
  type ConversionState,
  type MallAccountDraft,
} from '../lib/order-collection-page-model';
import {
  buildOrderCollectionPipelineSummary,
  buildOrderCollectionSummary,
} from '../lib/order-collection-stats';
import {
  createStoredTrackingFile,
  deleteGeneratedOrderFile,
  loadGeneratedOrderFiles,
  saveGeneratedOrderFile,
} from '../lib/order-generated-file-store';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
  type UpdateOrderCollectionMallAccountInput,
} from '../lib/order-mall-account-api';
import {
  runSellpiaPostProcess,
  type GeneratedTrackingArtifact,
  uploadTrackingForMall,
} from '../lib/order-tracking-actions';

import { CoupangDirectCalendarModal } from './CoupangDirectCalendarModal';
import type { CoupangDirectData, CoupangDirectPo } from '../lib/coupang-directship-api';
import {
  createCoupangDirectPoMemoryCache,
  readCachedDirectshipPos,
  readMemoryCachedDirectshipPos,
  writeCachedDirectshipPos,
  writeMemoryCachedDirectshipPos,
  type CoupangDirectPoCacheScope,
} from '../lib/coupang-directship-po-cache';
import {
  readCoupangDirectSnapshot,
  saveCoupangDirectSnapshot,
} from '../lib/coupang-directship-snapshot-api';

export function OrderCollectionWorkspace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const sellpiaShipmentTrackingOwner = useSellpiaShipmentTrackingSourceOwner();
  const showConfirm = useStore((store) => store.showConfirm);
  const historyRef = useRef<ConversionHistoryItem[]>([]);
  // 쿠팡직배송은 바로 수집하지 않고 입고예정일 달력에서 처리할 날짜를 먼저 고른다.
  const [directshipModal, setDirectshipModal] = useState<{
    account: OrderCollectionMallAccount;
    run: OrderCollectionExtensionRun | null;
    pos: CoupangDirectPo[];
    data: CoupangDirectData | null;
    loading: boolean;
  } | null>(null);
  // 한 번 불러온 발주 목록은 들고 있는다. 달력을 다시 열 때 로딩을 보지 않게 하려는 것으로,
  // 여는 즉시 캐시를 그리고 뒤에서 조용히 새로 받아 갱신한다.
  const directshipPosRef = useRef(createCoupangDirectPoMemoryCache());
  const sellpiaTransmissionQueueRef = useRef<Promise<void>>(Promise.resolve());
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
  const [bulkAction, setBulkAction] = useState<GeneratedFilesBulkAction>(null);
  const [lockedFileIds, setLockedFileIds] = useState<Set<string>>(() => new Set());
  const [sellpiaPostProcessing, setSellpiaPostProcessing] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedRocketAccountId, setSelectedRocketAccountId] = useState('');

  const mallAccountsQuery = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: orderMallAccountApi.list,
    meta: { suppressGlobalErrorToast: true },
  });
  const mallAccounts = mallAccountsQuery.data ?? [];
  const {
    rocketAccounts,
    isLoading: rocketAccountsLoading,
    isBootstrapping: rocketAccountBootstrapping,
    error: rocketAccountError,
  } = useRocketChannelAccounts();
  const selectedRocketAccount = rocketAccounts.find(
    ({ id }) => id === selectedRocketAccountId,
  ) ?? rocketAccounts[0] ?? null;
  const directshipCacheScope = useMemo<CoupangDirectPoCacheScope | null>(() => {
    if (!user?.organizationId || !selectedRocketAccount?.id) return null;
    return {
      organizationId: user.organizationId,
      channelAccountId: selectedRocketAccount.id,
    };
  }, [selectedRocketAccount?.id, user?.organizationId]);
  const cachedDirectshipPos = (): CoupangDirectPo[] => {
    if (!directshipCacheScope) return [];
    const memory = readMemoryCachedDirectshipPos(directshipPosRef.current, directshipCacheScope);
    if (memory) return memory;
    const stored = readCachedDirectshipPos(directshipCacheScope)?.pos ?? [];
    writeMemoryCachedDirectshipPos(directshipPosRef.current, directshipCacheScope, stored);
    return stored;
  };
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
  // 달력에서 소거법으로 뺄 발주번호.
  //
  // 기준은 "파일 생성"이 아니라 "셀피아 전송 요청"이다. 파일만 만들고 전송 대기 중인
  // 발주는 아직 처리해야 할 일이 남아 있는데, 파일 기준으로 빼면 달력에서 사라져
  // 38건 중 9건만 남는 것처럼 보인다.
  const collectedDirectshipSeqs = useMemo(
    () => new Set(
      history
        .filter((item) => item.mallKey === 'coupang-direct'
          && hasSellpiaTransmissionRequest(item))
        .flatMap((item) => item.orderNumbers ?? []),
    ),
    [history],
  );
  // 셀피아 실측 대조 결과. 버튼을 눌렀을 때만 조회하며, 있으면 몰 카드 "신규"가 이 값을 쓴다.
  const [sellpiaReconcile, setSellpiaReconcile] = useState<SellpiaReconcileResult | null>(null);
  // 대조를 돌렸으면 "신규"(=아직 셀피아에 안 올라간 주문)를 로컬 전송기록 대신 실측으로 바꾼다.
  const mallStatsByKey = useMemo(() => {
    if (!sellpiaReconcile) return orderCollectionSummary.mallStatsByKey;
    const merged = new Map(orderCollectionSummary.mallStatsByKey);
    for (const [mallKey, missing] of sellpiaReconcile.missingCountByMallKey) {
      const stat = merged.get(mallKey);
      if (stat) merged.set(mallKey, { ...stat, newRows: missing });
    }
    return merged;
  }, [orderCollectionSummary.mallStatsByKey, sellpiaReconcile]);
  const [reconciling, setReconciling] = useState(false);
  const handleReconcileWithSellpia = async (
    { silentWhenClean = false }: { silentWhenClean?: boolean } = {},
  ) => {
    if (reconciling) return;
    setReconciling(true);
    try {
      const {
        collectSellpiaOrderSnapshot,
        reconcileCollectedOrdersWithSellpia,
        SELLPIA_RECONCILE_PARTIAL_MESSAGE,
      } = await import('../lib/sellpia-order-reconcile');
      const { rows, partial } = await collectSellpiaOrderSnapshot();
      const result = reconcileCollectedOrdersWithSellpia({
        history: historyRef.current,
        sellpiaRows: rows,
        collectionDate: todayYmd(),
        partial,
        checkedAt: Date.now(),
      });
      setSellpiaReconcile(result);
      const missing = result.missingTotal;
      // 부분 조회는 숫자를 낼 수 없다. 조용히 넘기지 않고 미확인이라고 말한다(KID-163).
      if (missing === null) {
        toast.warning(SELLPIA_RECONCILE_PARTIAL_MESSAGE);
      } else if (missing > 0) {
        toast.warning(`셀피아 대조: 아직 안 올라간 주문 ${formatNumber(missing)}건`);
      } else if (!silentWhenClean) {
        // 전체 수집 뒤 자동 대조는 문제가 없으면 조용히 지나간다(수집 완료 토스트와 중복 방지).
        toast.success(
          `셀피아 대조 완료 · 오늘 수집분이 모두 올라가 있습니다 (셀피아 ${formatNumber(result.sellpiaOrderCount)}건 확인)`,
        );
      }
    } catch (error) {
      // 로그인·인증이 풀린 것은 몰 카드와 같은 말로 알린다(KID-163).
      const notice = collectionAttentionNotice(
        '셀피아',
        error,
        friendlyError(error) ?? '셀피아 대조에 실패했습니다.',
      );
      if (notice.tone === 'warning') toast.warning(notice.message);
      else toast.error(notice.message);
    } finally {
      setReconciling(false);
    }
  };
  const pipelineSummary = useMemo(
    () => buildOrderCollectionPipelineSummary(history),
    [history],
  );

  const {
    events,
    logActivity,
    clearMallErrorActivity,
    failedMallAccounts,
    failedMallReasonByKey,
  } = useOrderActivityEvents(mallAccounts);

  const handleTransmissionRequested = useCallback((file: ConversionHistoryItem) => {
    setHistory((current) =>
      current.map((entry) => (entry.id === file.id ? file : entry)),
    );
  }, []);
  const sellpiaTransmission = useSellpiaOrderTransmission({
    onTransmissionRequested: handleTransmissionRequested,
  });

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

  const addGeneratedTrackingFile = useCallback((artifact: GeneratedTrackingArtifact) => {
    addGeneratedFile(createStoredTrackingFile({
      ...artifact,
      collectionDate: todayYmd(),
    }));
  }, [addGeneratedFile]);

  const {
    collectAccount,
    collectAccounts,
    collectAll,
    collectionAdapter,
    startMall,
    sessionControls,
  } = useAllMarketplaceOrderCollection({
    mallAccounts,
    rocketChannelAccountId: selectedRocketAccount?.id ?? null,
    addGeneratedFile,
    setPreviewId,
    markCollecting,
    clearMallErrorActivity,
    logActivity,
  });
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

  const autoDetect = useOrderAutoDetect({
    mallAccounts,
    startMall,
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
    const batch = await collectAll();
    setBrowserCollecting(false);
    setState(batch.failedCount > 0 ? 'error' : 'success');
    const notice = orderCollectionBatchNotice(batch);
    if (notice.tone === 'warning') toast.warning(notice.message);
    else toast.success(notice.message);
    // 수집이 끝나면 셀피아와 대조해 "신규"를 아직 안 올라간 주문으로 맞춘다.
    await handleReconcileWithSellpia({ silentWhenClean: true });
  };

  const handleRetryFailedMalls = async () => {
    if (failedMallAccounts.length === 0) return;
    setBrowserCollecting(true);
    await collectAccounts(failedMallAccounts);
    setBrowserCollecting(false);
  };

  // 카드 영역 클릭 전용. 쿠팡직배송만 입고예정일 달력을 연다.
  // 수집 버튼은 이 경로를 타지 않고 곧바로 수집한다.
  const handleOpenDirectshipCalendar = async (account: OrderCollectionMallAccount) => {
    if (account.key !== 'coupang-direct') return;
    const cached = cachedDirectshipPos();
    // 캐시가 있으면 즉시 달력을 띄운다. 없을 때만 로딩을 보여준다.
    setDirectshipModal({
      account,
      run: null,
      pos: cached,
      data: null,
      loading: cached.length === 0,
    });
    // 로컬 캐시가 비었으면(다른 PC·시크릿창 등) DB 스냅샷을 먼저 보여준다.
    if (cached.length === 0 && directshipCacheScope) {
      void readCoupangDirectSnapshot(directshipCacheScope.channelAccountId)
        .then((snapshot) => {
          if (snapshot.length === 0) return;
          writeMemoryCachedDirectshipPos(directshipPosRef.current, directshipCacheScope, snapshot);
          writeCachedDirectshipPos(directshipCacheScope, snapshot);
          // 아직 확장 수집 전이면 스냅샷으로 달력을 채운다.
          setDirectshipModal((cur) => (cur && cur.pos.length === 0
            ? { ...cur, pos: snapshot, loading: false }
            : cur));
        })
        .catch(() => {/* 스냅샷은 편의 기능이라 실패해도 무시하고 확장 수집으로 간다 */});
    }
    let run: OrderCollectionExtensionRun | null = null;
    try {
      run = await sessionControls.prepareDirectRun(account);
      if (!run) throw new Error('주문수집 확장프로그램을 찾을 수 없습니다.');
      setDirectshipModal((cur) => (cur ? { ...cur, run } : cur));
      const { collectCoupangDirectFromExtension } = await import(
        '../lib/coupang-directship-api'
      );
      const data = await collectCoupangDirectFromExtension(run);
      if (directshipCacheScope) {
        writeMemoryCachedDirectshipPos(directshipPosRef.current, directshipCacheScope, data.pos);
        writeCachedDirectshipPos(directshipCacheScope, data.pos);
      }
      setDirectshipModal((cur) => (cur ? {
        ...cur,
        run,
        pos: data.pos,
        data,
        loading: false,
      } : cur));
    } catch (err) {
      if (run) {
        await sessionControls.failRun(
          run,
          'COLLECTION_FAILED',
          `${account.name} 발주 조회에 실패했습니다: ${friendlyError(err) ?? '조회 실패'}`,
        ).catch(() => undefined);
        sessionControls.releaseRun(account.key, run.attemptId);
      }
      const message = err instanceof Error ? err.message : '쿠팡 발주를 불러오지 못했습니다.';
      // 캐시로 이미 보여주고 있으면 화면을 닫지 않고 갱신 실패만 알린다.
      setDirectshipModal((cur) => (cur && cur.pos.length > 0 ? { ...cur, loading: false } : null));
      toast.error(message);
    }
  };

  /**
   * 쿠팡직배송만 입고예정일 달력에서 고른 날짜로 수집한다. 달력이 이미 연 시도를
   * 그대로 이어받고, 다른 몰은 카드의 공용 시작 컨트롤이 시작한다(KID-189).
   */
  const handleCollectDirectship = async (
    account: OrderCollectionMallAccount,
    existingAttemptId?: string,
    directship?: { eddDates: string[]; data?: CoupangDirectData },
  ) => {
    setState('converting');
    let run: OrderCollectionExtensionRun | null = null;
    try {
      run = await sessionControls.prepareDirectRun(account, existingAttemptId);
      const collected = await collectAccount(account, run, directship);
      if (directship?.data && directshipCacheScope && run) {
        await saveCoupangDirectSnapshot(
          directshipCacheScope.channelAccountId,
          directship.data.pos,
          run,
        ).catch(() => undefined);
      }
      setState('success');
      if (collected.masked) toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
      if (collected.rowCount > 0) toast.success(`${account.name} 수집 완료`);
    } catch (err) {
      if (run?.signal?.aborted) {
        setState('idle');
        toast.info(COLLECTION_STOPPED_MESSAGE);
        return;
      }
      setState('error');
      toast.error(mallCollectionFailureMessage(
        account.name,
        friendlyError(err) ?? '브라우저 수집 실패',
      ));
    }
  };

  /** 아직 수집할 수 없는 몰은 시작 자리에 이유를 보여 준다. */
  const mallStartBlockedReason = (account: OrderCollectionMallAccount): string | null => {
    if (!account.enabled) return '중지된 계정입니다.';
    return isBrowserCollectableMall(account) ? null : '자동 수집 준비 중';
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
    let run: OrderCollectionExtensionRun | null = null;
    try {
      // Manual uploads are source-owner attempts too. They do not need
      // extension admission, but their conversion must carry the same fence
      // so the server can terminalize the exact attempt that owns the file.
      run = await sessionControls.prepareManualUploadRun(mall);
      const result = await convertUploadedFile(mall, file, password, run);
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
      if (run) {
        await sessionControls.failRun(
          run,
          'CONVERSION_FAILED',
          `${mall.name} 파일 변환에 실패했습니다: ${friendlyError(err) ?? '변환 실패'}`,
        ).catch(() => undefined);
      }
      setState('error');
      throw err;
    } finally {
      if (run) sessionControls.releaseRun(mall.key, run.attemptId);
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
    if (selectedMall.key === 'art09' && !mallDraft.supplierLoginId.trim()) {
      toast.error('아트공구 공급사 ID를 입력해 주세요.');
      return;
    }
    await saveMallAccountMutation
      .mutateAsync({
        mallKey: selectedMall.key,
        input: {
          loginId: mallDraft.loginId,
          supplierLoginId: selectedMall.key === 'art09' ? mallDraft.supplierLoginId : undefined,
          password: mallDraft.password.trim() ? mallDraft.password : undefined,
          siteUrl: mallDraft.siteUrl,
          memo: mallDraft.memo,
          enabled: mallDraft.enabled,
        },
      })
      .catch(() => undefined);
  };

  const acquireGeneratedFiles = (fileIds: readonly string[]): (() => void) | null => {
    const release = generatedFileActionLock.acquire(fileIds);
    if (!release) return null;
    setLockedFileIds(new Set(generatedFileActionLock.lockedFileIds()));
    return () => {
      release();
      setLockedFileIds(new Set(generatedFileActionLock.lockedFileIds()));
    };
  };

  const enqueueSellpiaTransmission = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = sellpiaTransmissionQueueRef.current.then(operation, operation);
    sellpiaTransmissionQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const handleSendToSellpia = async (
    item: ConversionHistoryItem,
    options: {
      showSuccessToast?: boolean;
      retryConfirmed?: boolean;
    } = {},
  ): Promise<boolean> => {
    if (
      hasSellpiaTransmissionRequest(item)
      && !options.retryConfirmed
    ) {
      showConfirm({
        title: '셀피아에 다시 전송할까요?',
        message:
          '셀피아 주문서수집 화면과 주문 내역에서 이 파일이 실제로 접수되지 않은 것을 확인한 경우에만 진행하세요. 이미 접수된 파일을 다시 보내면 주문이 중복될 수 있습니다.',
        confirmText: '미접수 확인 후 재전송',
        cancelText: '취소',
        onConfirm: () => {
          void handleSendToSellpia(item, { retryConfirmed: true });
        },
      });
      return false;
    }
    const releaseAction = acquireGeneratedFiles([item.id]);
    if (!releaseAction) return false;
    try {
      return await enqueueSellpiaTransmission(() =>
        sellpiaTransmission.transmit(item, {
          showSuccessToast: options.showSuccessToast,
          retryConfirmed: options.retryConfirmed,
        }));
    } finally {
      releaseAction();
    }
  };

  const handleSendSelectedToSellpia = async (items: ConversionHistoryItem[]) => {
    const batch = [...items];
    if (batch.length === 0) return;
    const releaseAction = acquireGeneratedFiles(batch.map(({ id }) => id));
    if (!releaseAction) return;
    setBulkAction('send');
    let successCount = 0;
    try {
      await enqueueSellpiaTransmission(async () => {
        for (const item of batch) {
          if (await sellpiaTransmission.transmit(item, { showSuccessToast: false })) {
            successCount += 1;
          }
        }
      });
      if (successCount > 0) {
        toast.success(`선택 파일 ${formatNumber(successCount)}개 셀피아 전송 요청됨`);
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
        onGeneratedFile: addGeneratedTrackingFile,
      });
    } finally {
      setSellpiaPostProcessing(false);
    }
  };

  const handleDownloadSelected = async (items: ConversionHistoryItem[]) => {
    const batch = [...items];
    if (batch.length === 0) return;
    const releaseAction = acquireGeneratedFiles(batch.map(({ id }) => id));
    if (!releaseAction) return;
    setBulkAction('download');
    try {
      for (const item of batch) {
        downloadOrderCollectionFile(item);
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      toast.success(`선택 파일 ${formatNumber(batch.length)}개 다운로드 요청 완료`);
    } finally {
      setBulkAction(null);
      releaseAction();
    }
  };

  const handleDownloadGeneratedFile = (item: ConversionHistoryItem) => {
    const releaseAction = acquireGeneratedFiles([item.id]);
    if (!releaseAction) return;
    try {
      downloadOrderCollectionFile(item);
    } finally {
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
    const releaseAction = acquireGeneratedFiles([item.id]);
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
    const batch = [...items];
    const releaseAction = acquireGeneratedFiles(batch.map(({ id }) => id));
    if (!releaseAction) return;
    setBulkAction('delete');
    try {
      const deletedCount = await deleteGeneratedFiles(batch);
      if (deletedCount === batch.length) {
        toast.success(`선택 파일 ${formatNumber(deletedCount)}개를 삭제했습니다.`);
      } else {
        toast.warning(
          `${formatNumber(deletedCount)}개 삭제 완료, ${formatNumber(batch.length - deletedCount)}개 실패`,
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
        <div className="flex flex-wrap items-center gap-2">
          {selectedRocketAccount && rocketAccounts.length > 1 ? (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span>로켓 계정</span>
              <select
                aria-label="주문 수집 로켓 채널 계정"
                value={selectedRocketAccount.id}
                onChange={(event) => setSelectedRocketAccountId(event.target.value)}
                className="max-w-52 rounded-lg border border-slate-300 bg-white px-2 py-2"
              >
                {rocketAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          ) : selectedRocketAccount || rocketAccountsLoading || rocketAccountBootstrapping ? (
            // 연결 완료/연결 중은 조치가 필요 없으므로 헤더에 문구를 띄우지 않는다.
            null
          ) : (
            <span className="text-xs font-semibold text-amber-700">
              {rocketAccountError
                ? `로켓 계정 자동 연결 실패: ${friendlyError(rocketAccountError)}`
                : '쿠팡 익스텐션 계정 감지 필요'}
            </span>
          )}
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            <Upload size={16} />
            업로드
          </button>
        </div>
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
        collectionControls={<SellpiaShipmentTrackingControl />}
        autoDetect={autoDetect.enabled}
        autoIntervalMin={autoDetect.intervalMin}
        autoIntervalOptions={AUTO_INTERVAL_OPTIONS_MIN}
        autoLastRunAt={autoDetect.lastRunAt}
        autoNextRunAt={autoDetect.nextRunAt}
        autoRunning={autoDetect.running}
        browserCollecting={browserCollecting}
        collectingKeys={collectingKeys}
        configuredMallCount={configuredMallCount}
        conversionState={state}
        enabledMallCount={enabledMallCount}
        failedMallCount={failedMallAccounts.length}
        failedMallReasonByKey={failedMallReasonByKey}
        mallAccounts={mallAccounts}
        mallCollectionStats={mallStatsByKey}
        onReconcileSellpia={() => void handleReconcileWithSellpia({})}
        reconciling={reconciling}
        reconcileCheckedAt={sellpiaReconcile?.checkedAt ?? null}
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
        renderCollectionControl={(account) => (
          <MallCollectionControl
            account={account}
            buildAdapter={collectionAdapter}
            startBlockedReason={mallStartBlockedReason(account)}
          />
        )}
        onOpenCalendar={(account) => void handleOpenDirectshipCalendar(account)}
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
            history,
            logError: (title, message) => logActivity('error', title, message),
            onGeneratedFile: addGeneratedTrackingFile,
            collectTracking: sellpiaShipmentTrackingOwner.collect,
          })
        }
      />

      {previewItem ? (
       <FilePreviewSection
         item={previewItem}
         onClose={() => setPreviewId(null)}
          onDownload={handleDownloadGeneratedFile}
       />
      ) : null}

      <GeneratedFilesSection
        items={history}
        bulkAction={bulkAction}
        lockedFileIds={lockedFileIds}
        sellpiaSendingId={sellpiaTransmission.sendingId}
        sellpiaSettlingId={sellpiaTransmission.settlingId}
        sellpiaPostProcessing={sellpiaPostProcessing}
        onDelete={(item) => void handleDeleteGeneratedFile(item)}
        onDeleteSelected={(items) => void handleDeleteSelected(items)}
        onDownload={handleDownloadGeneratedFile}
        onDownloadSelected={(items) => void handleDownloadSelected(items)}
        onPreview={setPreviewId}
        onSellpiaPostProcess={() => void handleSellpiaPostProcess()}
        onSendToSellpia={(item) => void handleSendToSellpia(item)}
        onSendSelectedToSellpia={(items) => void handleSendSelectedToSellpia(items)}
      />

      {directshipModal ? (
        <CoupangDirectCalendarModal
          open
          loading={directshipModal.loading}
          pos={directshipModal.pos}
          collectedSeqs={collectedDirectshipSeqs}
          today={todayYmd()}
          onClose={() => {
            const pending = directshipModal;
            setDirectshipModal(null);
            if (pending.run) {
              void sessionControls.cancelRun(pending.account).catch((error: unknown) => {
                toast.error(friendlyError(error) ?? `${pending.account.name} 수집 중단에 실패했습니다.`);
              });
            }
          }}
          onCollect={(eddDates) => {
            const { account, run } = directshipModal;
            setDirectshipModal(null);
            void handleCollectDirectship(account, run?.attemptId, {
              eddDates,
              data: directshipModal.data ?? undefined,
            });
          }}
        />
      ) : null}

    </div>
  );
}

async function convertUploadedFile(
  mall: OrderCollectionMallAccount,
  file: File,
  password?: string,
  run?: OrderCollectionExtensionRun,
) {
  if (mall.key === 'domeggook') {
    const { convertDomeggookOrderFile } = await import('../lib/order-collection-api');
    return convertDomeggookOrderFile(file, { run });
  }
  if (mall.key === 'gs-shop') {
    const { convertGsshopOrderFile } = await import('../lib/order-collection-api');
    return convertGsshopOrderFile(file, { download: false, run });
  }
  if (mall.key === ICECREAM_MALL_KEY) {
    const { convertIcecreamMallOrderFile } = await import('../lib/order-collection-api');
    return convertIcecreamMallOrderFile(file, password, run);
  }
  throw new Error(`${mall.name} 업로드 변환은 아직 준비 중입니다.`);
}
