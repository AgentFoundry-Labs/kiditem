'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COUPANG_CATALOG_COLLECTOR_VERSION,
  CoupangCatalogCollectionRunSchema,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  getCoupangCatalogBrowserStatus,
  startCoupangCatalogBrowser,
} from '@/lib/coupang-catalog-extension';
import { channelListingsApi } from '../lib/channel-listings-api';

const STORAGE_KEY = 'kiditem:coupang-catalog-import:active-attempt';
type ActiveAttempt = {
  channelAccountId: string;
  attemptId: string | null;
  idempotencyKey: string | null;
};

export function useCoupangCatalogImport(
  channelAccountId: string | null,
  linkedAttemptId: string | null = null,
) {
  const queryClient = useQueryClient();
  const [activeAttempt, setActiveAttempt] = useState<ActiveAttempt | null>(() =>
    channelAccountId && linkedAttemptId
      ? { channelAccountId, attemptId: linkedAttemptId, idempotencyKey: null }
      : readActiveAttempt());
  const activeRef = useRef(activeAttempt);
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const completedAttempts = useRef(new Set<string>());
  const remember = (next: ActiveAttempt) => {
    activeRef.current = next;
    setActiveAttempt(next);
    if (next.idempotencyKey) safeStorageSet('local', STORAGE_KEY, JSON.stringify(next));
  };

  const serverStatusQuery = useQuery({
    queryKey: queryKeys.coupangCatalogImports.run(activeAttempt?.channelAccountId ?? '', activeAttempt?.attemptId ?? ''),
    queryFn: () => channelListingsApi.getCoupangCatalogCollection(
      activeAttempt!.channelAccountId, activeAttempt!.attemptId!,
    ),
    enabled: !!activeAttempt?.attemptId,
    retry: false,
    refetchInterval: (query) =>
      !query.state.data || query.state.data.state === 'RUNNING' ? 2_000 : false,
  });
  const serverStatus = serverStatusQuery.data ?? null;

  useEffect(() => {
    if (!activeAttempt?.attemptId || extensionId) return;
    let cancelled = false;
    void detectExtensionId().then((detected) => {
      if (!cancelled) setExtensionId(detected);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeAttempt?.attemptId, extensionId]);

  const extensionStatusQuery = useQuery({
    queryKey: queryKeys.coupangCatalogImports.extension(activeAttempt?.attemptId ?? ''),
    queryFn: () => getCoupangCatalogBrowserStatus(extensionId!, activeAttempt!.attemptId!),
    enabled: !!activeAttempt?.attemptId && !!extensionId && serverStatus?.state !== 'COMPLETE',
    retry: false,
    refetchInterval: () => serverStatus?.state === 'RUNNING' ? 2_000 : false,
  });

  useEffect(() => {
    if (serverStatus?.state !== 'FAILED' || !extensionId) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.coupangCatalogImports.extension(serverStatus.attemptId),
    });
  }, [extensionId, queryClient, serverStatus?.attemptId, serverStatus?.state]);

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!channelAccountId) throw new Error('쿠팡 채널 계정을 선택해주세요.');
      const existing = activeRef.current;
      const previous = existing?.channelAccountId === channelAccountId && existing.attemptId
        ? await channelListingsApi.getCoupangCatalogCollection(channelAccountId, existing.attemptId)
        : null;
      const terminal = previous && previous.state !== 'RUNNING';
      const next: ActiveAttempt = existing?.channelAccountId === channelAccountId && !terminal
        ? { ...existing, idempotencyKey: previous?.idempotencyKey ?? existing.idempotencyKey }
        : { channelAccountId, attemptId: null, idempotencyKey: createSecureRandomUuid() };
      remember(next);
      const permit = await channelListingsApi.startCoupangCatalogCollection(
        channelAccountId,
        { collectorVersion: !terminal && previous ? previous.plan.collectorVersion : COUPANG_CATALOG_COLLECTOR_VERSION },
        next.idempotencyKey!,
      );
      if (permit.plan.channelAccountId !== channelAccountId ||
          (next.attemptId && next.attemptId !== permit.attemptId)) {
        throw new Error('쿠팡 수집 시도 응답이 일치하지 않습니다.');
      }
      remember({ ...next, attemptId: permit.attemptId });
      if (permit.state === 'RUNNING') {
        setExtensionId(await startCoupangCatalogBrowser({ permit }));
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.run(channelAccountId, permit.attemptId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.extension(permit.attemptId),
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const active = activeRef.current;
      if (!active?.attemptId) throw new Error('중단할 쿠팡 수집 시도가 없습니다.');
      const { channelAccountId: accountId, attemptId } = active;
      const queryKey = queryKeys.coupangCatalogImports.run(accountId, attemptId);
      const owner = await channelListingsApi.getCoupangCatalogCollection(accountId, attemptId);
      queryClient.setQueryData(queryKey, owner);
      if (owner.state !== 'RUNNING') return;
      remember({ ...active, idempotencyKey: owner.idempotencyKey });
      const permit = await channelListingsApi.startCoupangCatalogCollection(
        accountId, { collectorVersion: owner.plan.collectorVersion }, owner.idempotencyKey,
      );
      if (permit.attemptId !== attemptId || permit.plan.channelAccountId !== accountId) {
        throw new Error('쿠팡 수집 시도 응답이 일치하지 않습니다.');
      }
      let failure: unknown;
      if (permit.state === 'RUNNING') {
        try {
          await channelListingsApi.failCoupangCatalogCollection(accountId, attemptId, permit.attemptToken, {
            code: 'USER_CANCELLED', message: '사용자가 수집을 중단했습니다.',
            phase: owner.phase === 'finished' ? 'publishing' : owner.phase,
          });
        } catch (cause) { failure = cause; }
      }
      const settled = await channelListingsApi.getCoupangCatalogCollection(accountId, attemptId);
      queryClient.setQueryData(queryKey, settled);
      if (settled.state === 'RUNNING') {
        throw failure ?? new Error('수집 중단이 아직 확인되지 않았습니다. 서버 상태를 다시 확인해주세요.');
      }
      try {
        const detected = extensionId ?? await detectExtensionId();
        if (detected) await sendToExtension(detected, { action: 'cancelCoupangCatalogImport', attemptId });
      } catch { /* The owner is already terminal; local tab cleanup is best-effort. */ }
    },
  });

  useEffect(() => {
    if (!serverStatus || serverStatus.state !== 'COMPLETE' ||
        completedAttempts.current.has(serverStatus.attemptId)) return;
    completedAttempts.current.add(serverStatus.attemptId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.channelProductMappings.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all });
  }, [queryClient, serverStatus]);

  return {
    activeAttempt,
    serverStatus,
    extensionStatus: extensionStatusQuery.data ?? null,
    isStarting: startMutation.isPending,
    isStopping: cancelMutation.isPending,
    startError: startMutation.error,
    readError: serverStatusQuery.error,
    start: startMutation.mutateAsync,
    cancel: cancelMutation.mutateAsync,
    openAttention: async () => {
      const attemptId = activeRef.current?.attemptId;
      const detected = extensionId ?? await detectExtensionId();
      if (!attemptId || !detected) throw new Error('수집 확인 탭을 찾을 수 없습니다.');
      await sendToExtension(detected, { action: 'openCollectionAttentionTab', attemptId });
    },
  };
}

function readActiveAttempt(): ActiveAttempt | null {
  const raw = safeStorageGet('local', STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const uuid = CoupangCatalogCollectionRunSchema.shape.attemptId;
    if (!uuid.safeParse(parsed.channelAccountId).success ||
        !uuid.safeParse(parsed.idempotencyKey).success ||
        (parsed.attemptId !== null && !uuid.safeParse(parsed.attemptId).success)) return null;
    return { channelAccountId: parsed.channelAccountId, idempotencyKey: parsed.idempotencyKey, attemptId: parsed.attemptId };
  } catch { return null; }
}
