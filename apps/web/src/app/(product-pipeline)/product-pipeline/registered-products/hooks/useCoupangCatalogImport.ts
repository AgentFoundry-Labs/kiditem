'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COUPANG_CATALOG_COLLECTOR_VERSION,
  type CoupangCatalogCollectionRun,
  type CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  getCoupangCatalogBrowserStatus,
  startCoupangCatalogBrowser,
} from '@/lib/coupang-catalog-extension';
import {
  channelListingsApi,
  readActiveCoupangCatalogAttemptForStage,
  rememberCoupangCatalogAttemptForStage,
  type ActiveCoupangCatalogAttempt,
} from '../lib/channel-listings-api';

export interface UseCoupangCatalogImportOptions {
  /** Pause status/extension polling while the owning surface is closed. */
  enabled?: boolean;
  /** Do not adopt a browser-local attempt when a URL link is being validated. */
  suppressStoredAttempt?: boolean;
  /** Called once when this owner reaches a terminal state. */
  onSettled?: (run: CoupangCatalogCollectionRun, explicitlyStarted: boolean) => void | Promise<void>;
}

function storedStage(attempt: Pick<ActiveCoupangCatalogAttempt, 'stage'>): CoupangCatalogStage {
  return attempt.stage ?? 'full';
}

export function useCoupangCatalogImport(
  channelAccountId: string | null,
  linkedAttemptId: string | null = null,
  stage: CoupangCatalogStage = 'full',
  options: UseCoupangCatalogImportOptions = {},
) {
  const { enabled = true, suppressStoredAttempt = false, onSettled } = options;
  const queryClient = useQueryClient();
  const inputKey = `${channelAccountId ?? ''}:${linkedAttemptId ?? ''}:${stage}`;
  const resolveInputAttempt = () => {
    if (channelAccountId && linkedAttemptId) {
      return { channelAccountId, attemptId: linkedAttemptId, idempotencyKey: null, stage };
    }
    if (suppressStoredAttempt) return null;
    // The readiness surface starts the staged basics root, but keep a legacy
    // full owner resumable while its local attempt is still active. New
    // explicit starts continue to use the requested stage.
    const stored = readActiveCoupangCatalogAttemptForStage(stage) ??
      (stage === 'basics' ? readActiveCoupangCatalogAttemptForStage('full') : null);
    return channelAccountId && stored?.channelAccountId !== channelAccountId ? null : stored;
  };
  const [activeAttempt, setActiveAttempt] = useState<ActiveCoupangCatalogAttempt | null>(resolveInputAttempt);
  const activeRef = useRef(activeAttempt);
  const inputKeyRef = useRef(inputKey);
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const completedAttempts = useRef(new Set<string>());
  const explicitlyStartedAttempts = useRef(new Set<string>());
  const activeAttemptForInput = activeAttempt && matchesInput(
    activeAttempt,
    channelAccountId,
    linkedAttemptId,
    stage,
  ) ? activeAttempt : null;

  // A panel can switch accounts or stage while this hook instance stays
  // mounted. Do not let the previous account's owner status or permit leak
  // into the new query/mutation key for even one user action.
  useEffect(() => {
    if (inputKeyRef.current === inputKey) return;
    inputKeyRef.current = inputKey;
    const next = resolveInputAttempt();
    activeRef.current = next;
    setActiveAttempt(next);
    setExtensionId(null);
    completedAttempts.current.clear();
  }, [inputKey]);

  const remember = (next: ActiveCoupangCatalogAttempt) => {
    activeRef.current = next;
    setActiveAttempt(next);
    rememberCoupangCatalogAttemptForStage(storedStage(next), next);
  };

  const serverStatusQuery = useQuery({
    queryKey: queryKeys.coupangCatalogImports.run(activeAttemptForInput?.channelAccountId ?? '', activeAttemptForInput?.attemptId ?? ''),
    queryFn: () => channelListingsApi.getCoupangCatalogCollection(
      activeAttemptForInput!.channelAccountId,
      activeAttemptForInput!.attemptId!,
      storedStage(activeAttemptForInput!),
    ),
    enabled: enabled && !!activeAttemptForInput?.attemptId,
    retry: false,
    refetchInterval: (query) =>
      !query.state.data || query.state.data.overallState === 'RUNNING' || query.state.data.state === 'RUNNING'
        ? 2_000
        : false,
  });
  const serverStatus = serverStatusQuery.data ?? null;

  useEffect(() => {
    if (!enabled || !activeAttemptForInput?.attemptId || extensionId) return;
    let cancelled = false;
    void detectExtensionId().then((detected) => {
      if (!cancelled) setExtensionId(detected);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeAttemptForInput?.attemptId, enabled, extensionId]);

  const extensionStatusQuery = useQuery({
    queryKey: queryKeys.coupangCatalogImports.extension(activeAttemptForInput?.attemptId ?? ''),
    queryFn: () => getCoupangCatalogBrowserStatus(extensionId!, activeAttemptForInput!.attemptId!),
    enabled: enabled && !!activeAttemptForInput?.attemptId && !!extensionId &&
      serverStatus?.overallState !== 'COMPLETE',
    retry: false,
    refetchInterval: () => serverStatus?.overallState === 'COMPLETE'
      ? false
      : (serverStatus?.overallState === 'RUNNING' ||
          serverStatus?.state === 'RUNNING' ||
          (stage === 'basics' && serverStatus?.state === 'COMPLETE') ||
          serverStatus?.currentStage === 'details'
        ? 2_000
        : false),
  });

  // The extension keeps the stable basics/root ID while it hands the owner
  // token to the internal details child. Once that handoff is visible, read
  // the child owner for its progress/publication receipt while retaining the
  // root query as the durable chain anchor and cancellation target.
  const serverCurrentAttemptId = serverStatus?.currentAttemptId ?? null;
  const serverHasAuthoritativeChild = Boolean(
    activeAttemptForInput?.attemptId &&
    serverCurrentAttemptId &&
    serverCurrentAttemptId !== activeAttemptForInput.attemptId &&
    (serverStatus?.currentStage === 'details' ||
      serverStatus?.rootAttemptId === activeAttemptForInput.attemptId),
  );
  // The server root receipt is the canonical chain link. Browser progress can
  // expose a useful transient phase, but must not select a child owner that
  // the server has not linked to this root.
  const observedAttemptId = serverHasAuthoritativeChild
    ? serverCurrentAttemptId
    : serverCurrentAttemptId ?? activeAttemptForInput?.attemptId ?? null;
  const observedStage = serverStatus?.currentStage ??
    serverStatus?.plan.stage ??
    storedStage(activeAttemptForInput ?? { stage });
  const childAttemptId = observedAttemptId && activeAttemptForInput?.attemptId &&
    observedAttemptId !== activeAttemptForInput.attemptId && observedStage === 'details'
    ? observedAttemptId
    : null;
  const childStatusQuery = useQuery({
    queryKey: queryKeys.coupangCatalogImports.run(
      activeAttemptForInput?.channelAccountId ?? '', childAttemptId ?? '',
    ),
    queryFn: () => channelListingsApi.getCoupangCatalogCollection(
      activeAttemptForInput!.channelAccountId, childAttemptId!, 'details',
    ),
    enabled: enabled && !!childAttemptId && observedStage === 'details',
    retry: false,
    refetchInterval: (query) =>
      !query.state.data || query.state.data.overallState === 'RUNNING' || query.state.data.state === 'RUNNING'
        ? 2_000
        : false,
  });

  const childRootId = childStatusQuery.data?.rootAttemptId ??
    childStatusQuery.data?.plan.rootAttemptId ??
    childStatusQuery.data?.plan.basicAttemptId ?? null;
  const childStatusMatchesRoot = Boolean(
    childStatusQuery.data &&
    activeAttemptForInput?.attemptId &&
    childRootId === activeAttemptForInput.attemptId,
  );
  const childStatus = childStatusMatchesRoot ? childStatusQuery.data ?? null : null;
  const currentAttemptId = childStatus?.currentAttemptId ?? observedAttemptId;
  const currentStage = childStatus?.currentStage ?? observedStage;

  const chainRootId = serverStatus?.rootAttemptId ?? serverStatus?.attemptId ?? null;
  const childIsExpected = Boolean(childAttemptId);
  const standaloneBasicsReceipt = Boolean(
    serverStatus &&
    activeAttemptForInput?.attemptId &&
    isStandaloneCompletedBasicsRoot(serverStatus, activeAttemptForInput.attemptId),
  );
  // Extension terminal state is only a local progress/attention hint. A
  // basics owner can be COMPLETE while its details child is still running;
  // settle from the server root/child receipt only, and stay unresolved while
  // the child receipt is delayed or failed to read.
  const chainOverallState = childIsExpected
    ? childStatus
      ? childStatus.overallState ?? childStatus.state
      : serverStatus?.overallState === 'RUNNING' ? 'RUNNING' : null
    : standaloneBasicsReceipt
      ? null
      : serverStatus?.overallState ??
        (observedStage === 'basics' && serverStatus?.state === 'COMPLETE' ? null : serverStatus?.state) ??
        null;
  const chainOwner = childStatus ?? serverStatus;
  const chainStatus = chainOwner
    ? {
        ...chainOwner,
        rootAttemptId: chainRootId ?? undefined,
        currentAttemptId: currentAttemptId ?? undefined,
        currentStage,
        overallState: chainOverallState ?? undefined,
      }
    : null;

  // A completed basics receipt can keep the whole-flow projection RUNNING
  // until the details child is admitted. Only an explicit start/cancel may
  // invoke this bounded browser stop-and-reread; status reads stay passive.
  const stopCompletedBasicsRootWithoutChild = async (
    accountId: string,
    rootAttemptId: string,
    rootStage: CoupangCatalogStage,
    rootOwner: CoupangCatalogCollectionRun,
  ): Promise<CoupangCatalogCollectionRun> => {
    if (!isCompletedBasicsRootWithoutChild(rootOwner, rootAttemptId) ||
        rootOwner.overallState !== 'RUNNING' || childAttemptId || childStatus) {
      throw new Error('쿠팡 상세 수집 상태를 확인한 뒤 다시 시도해주세요.');
    }
    const detected = extensionId ?? await detectExtensionId();
    if (!detected) {
      throw new Error('쿠팡 상품 수집 중단 상태를 확인하지 못했습니다. 확장프로그램을 새로고침해주세요.');
    }
    const response = await sendToExtension<{
      success?: boolean;
      cancelled?: boolean;
      error?: string;
    }>(detected, { action: 'cancelCoupangCatalogImport', attemptId: rootAttemptId });
    if (response?.success !== true || response.cancelled !== true) {
      throw new Error(response?.error ?? '쿠팡 수집 중단 응답을 확인하지 못했습니다.');
    }
    const rootQueryKey = queryKeys.coupangCatalogImports.run(accountId, rootAttemptId);
    const settledRoot = await channelListingsApi.getCoupangCatalogCollection(
      accountId,
      rootAttemptId,
      rootStage,
    );
    queryClient.setQueryData(rootQueryKey, settledRoot);
    if (!isCompletedBasicsRootWithoutChild(settledRoot, rootAttemptId)) {
      throw new Error('쿠팡 상세 수집 상태를 확인한 뒤 다시 시도해주세요.');
    }
    return settledRoot;
  };

  useEffect(() => {
    if (serverStatus?.state !== 'FAILED' || !extensionId) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.coupangCatalogImports.extension(serverStatus.attemptId),
    });
  }, [extensionId, queryClient, serverStatus?.attemptId, serverStatus?.state]);

  const startMutation = useMutation({
    mutationFn: async (requestedAccountId?: string) => {
      const selectedAccountId = requestedAccountId ?? channelAccountId;
      if (!selectedAccountId) throw new Error('쿠팡 채널 계정을 선택해주세요.');
      const existing = activeRef.current;
      const existingStage = existing ? storedStage(existing) : stage;
      const previous = existing?.channelAccountId === selectedAccountId && existing.attemptId
        ? await channelListingsApi.getCoupangCatalogCollection(selectedAccountId, existing.attemptId, existingStage)
        : null;
      const childOwner = previous && childAttemptId && childStatus?.attemptId === childAttemptId
        ? childStatus
        : null;
      const resumeOwner = childOwner ?? previous;
      const resumeStage = childOwner
        ? childOwner.plan.stage ?? 'full'
        : previous
          ? existingStage
          : stage;
      const wholeFlowState = chainOverallState ?? previous?.overallState ?? previous?.state ?? null;
      const preExpiryBasicsRootWithoutChild = Boolean(
        previous &&
        isCompletedBasicsRootWithoutChild(previous, previous.attemptId) &&
        previous.overallState === 'RUNNING' &&
        !childAttemptId && !childStatus,
      );
      // A staged root may be terminal for its partial publication while the
      // details child is still the current owner. Never create a fresh basics
      // root in that handoff window; resume the exact child identity or wait
      // for its server receipt to become readable.
      const previousHasUnresolvedChild = Boolean(
        previous &&
        (previous.currentStage === 'details' ||
          (previous.currentAttemptId && previous.currentAttemptId !== previous.attemptId)),
      );
      if (previous && wholeFlowState === 'RUNNING' &&
          previous.state !== 'RUNNING' && previousHasUnresolvedChild && !childOwner) {
        throw new Error('쿠팡 상세 수집 상태를 확인한 뒤 다시 시도해주세요.');
      }
      if (preExpiryBasicsRootWithoutChild && previous) {
        await stopCompletedBasicsRootWithoutChild(
          selectedAccountId,
          previous.attemptId,
          existingStage,
          previous,
        );
      }
      const notBeforeMs = resumeOwner?.error?.notBefore
        ? toTimestamp(resumeOwner.error.notBefore)
        : Number.NaN;
      const waitingForResume = Number.isFinite(notBeforeMs) && notBeforeMs > Date.now();
      if (waitingForResume) {
        throw new Error(`쿠팡 ${stageLabel(stage)} 수집은 ${formatResumeAt(notBeforeMs)} 이후 재개할 수 있습니다.`);
      }
      // Terminal/retry decisions use the whole-flow receipt, not the partial
      // root row's state. A recoverable provider pause remains RUNNING and
      // reuses its exact idempotency key and attempt.
      const terminal = previous
        ? wholeFlowState !== 'RUNNING' || preExpiryBasicsRootWithoutChild
        : false;
      const reusingPendingBegin = Boolean(existing?.channelAccountId === selectedAccountId &&
        !existing.attemptId && existing.idempotencyKey);
      const resumingExisting = Boolean(existing?.channelAccountId === selectedAccountId &&
        (reusingPendingBegin || (resumeOwner && !terminal)));
      const nextStage = resumingExisting ? resumeStage : stage;
      const next: ActiveCoupangCatalogAttempt = resumingExisting && existing
        ? { ...existing, stage: existingStage, idempotencyKey: existing.idempotencyKey }
        : { channelAccountId: selectedAccountId, attemptId: null, idempotencyKey: createSecureRandomUuid(), stage: nextStage };
      const resumeKey = terminal
        ? next.idempotencyKey
        : childOwner?.idempotencyKey ??
          (resumeStage === 'details' ? previous?.plan.detailsIdempotencyKey : resumeOwner?.idempotencyKey) ??
          next.idempotencyKey;
      if (!resumeKey) throw new Error('쿠팡 수집 재개 키를 확인할 수 없습니다.');
      const expectedBasicAttemptId = childOwner?.plan.rootAttemptId ??
        previous?.plan.rootAttemptId ?? existing?.attemptId;
      remember(next);
      const permit = await channelListingsApi.startCoupangCatalogCollection(
        selectedAccountId,
        {
          collectorVersion: !terminal && resumeOwner
            ? resumeOwner.plan.collectorVersion
            : COUPANG_CATALOG_COLLECTOR_VERSION,
          ...(nextStage !== 'full' ? { stage: nextStage } : {}),
          ...(nextStage === 'details' && expectedBasicAttemptId
            ? { expectedBasicAttemptId }
            : {}),
        },
        resumeKey,
      );
      const expectedPermitAttemptId = resumingExisting && childOwner
        ? childOwner.attemptId
        : next.attemptId;
      if (permit.plan.channelAccountId !== selectedAccountId ||
          (permit.plan.stage ?? 'full') !== nextStage ||
          (expectedPermitAttemptId && expectedPermitAttemptId !== permit.attemptId)) {
        throw new Error('쿠팡 수집 시도 응답이 일치하지 않습니다.');
      }
      if (!resumingExisting || !childOwner) remember({ ...next, attemptId: permit.attemptId });
      explicitlyStartedAttempts.current.add(permit.attemptId);
      if (existing?.attemptId) explicitlyStartedAttempts.current.add(existing.attemptId);
      if (permit.state === 'RUNNING') {
        setExtensionId(await startCoupangCatalogBrowser({ permit }));
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.run(selectedAccountId, permit.attemptId),
      });
      if (existing?.attemptId && existing.attemptId !== permit.attemptId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.coupangCatalogImports.run(selectedAccountId, existing.attemptId),
        });
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.extension(permit.attemptId),
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const active = activeRef.current;
      if (!active?.attemptId || !matchesInput(active, channelAccountId, linkedAttemptId, stage))
        throw new Error('중단할 쿠팡 수집 시도가 없습니다.');
      const { channelAccountId: accountId, attemptId: rootAttemptId } = active;
      const rootStage = storedStage(active);
      const rootQueryKey = queryKeys.coupangCatalogImports.run(accountId, rootAttemptId);
      const rootOwner = await channelListingsApi.getCoupangCatalogCollection(
        accountId,
        rootAttemptId,
        rootStage,
      );
      queryClient.setQueryData(rootQueryKey, rootOwner);
      const owner = childStatus?.attemptId && childAttemptId
        ? childStatus
        : rootOwner;
      const attemptId = owner.attemptId;
      const ownerStage = owner.plan.stage ?? rootStage;
      const ownerOverallState = rootOwner.overallState ?? owner.overallState ?? owner.state;
      const preExpiryBasicsRootWithoutChild =
        isCompletedBasicsRootWithoutChild(rootOwner, rootAttemptId) &&
        rootOwner.overallState === 'RUNNING' &&
        !childAttemptId && !childStatus;
      if (rootOwner.state === 'COMPLETE' && rootOwner.overallState === 'RUNNING' &&
          (rootOwner.plan.stage ?? rootStage) === 'basics' &&
          !preExpiryBasicsRootWithoutChild && !childStatus) {
        throw new Error('쿠팡 상세 수집 상태를 확인한 뒤 다시 시도해주세요.');
      }
      if (ownerOverallState !== 'RUNNING') return;
      if (childAttemptId && !childStatus) {
        throw new Error('쿠팡 상세 수집 상태를 확인한 뒤 다시 시도해주세요.');
      }

      if (preExpiryBasicsRootWithoutChild) {
        await stopCompletedBasicsRootWithoutChild(
          accountId,
          rootAttemptId,
          rootStage,
          rootOwner,
        );
        explicitlyStartedAttempts.current.delete(rootAttemptId);
        return;
      }

      // Stop the provider tab before mutating the server owner. A missing
      // extension is safe to ignore (there is no browser session to stop),
      // but a detected session must acknowledge the command; otherwise the
      // cancellation stays visibly uncertain instead of pretending success.
      const detected = extensionId ?? await detectExtensionId();
      if (detected) {
        const response = await sendToExtension<{
          success?: boolean;
          cancelled?: boolean;
          error?: string;
        }>(detected, { action: 'cancelCoupangCatalogImport', attemptId });
        if (response?.success !== true || response.cancelled !== true) {
          throw new Error(response?.error ?? '쿠팡 수집 중단 응답을 확인하지 못했습니다.');
        }
      }

      explicitlyStartedAttempts.current.delete(rootAttemptId);
      explicitlyStartedAttempts.current.delete(attemptId);
      if (attemptId === rootAttemptId) remember({ ...active, idempotencyKey: owner.idempotencyKey });
      const permit = await channelListingsApi.startCoupangCatalogCollection(
        accountId,
        {
          collectorVersion: owner.plan.collectorVersion,
          ...(ownerStage !== 'full' ? { stage: ownerStage } : {}),
          ...(ownerStage === 'details' && (owner.plan.rootAttemptId ?? rootAttemptId)
            ? { expectedBasicAttemptId: owner.plan.rootAttemptId ?? rootAttemptId }
            : {}),
        },
        owner.idempotencyKey,
      );
      if (permit.attemptId !== attemptId || permit.plan.channelAccountId !== accountId ||
          (permit.plan.stage ?? 'full') !== ownerStage) {
        throw new Error('쿠팡 수집 시도 응답이 일치하지 않습니다.');
      }
      let failure: unknown;
      if (permit.state === 'RUNNING') {
        try {
          await channelListingsApi.failCoupangCatalogCollection(accountId, attemptId, permit.attemptToken, {
            code: 'USER_CANCELLED', message: '사용자가 수집을 중단했습니다.',
            // A finished owner is terminal, so its permit is never RUNNING here.
            phase: owner.phase === 'finished' ? 'ready_to_finalize' : owner.phase,
          });
        } catch (cause) { failure = cause; }
      }
      const settled = await channelListingsApi.getCoupangCatalogCollection(accountId, attemptId, ownerStage);
      queryClient.setQueryData(
        queryKeys.coupangCatalogImports.run(accountId, attemptId),
        settled,
      );
      const settledOverallState = settled.overallState ?? settled.state;
      if (settledOverallState === 'RUNNING') {
        throw failure ?? new Error('수집 중단이 아직 확인되지 않았습니다. 서버 상태를 다시 확인해주세요.');
      }
      if (attemptId !== rootAttemptId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.coupangCatalogImports.run(accountId, rootAttemptId),
        });
      }
    },
  });

  useEffect(() => {
    if (!chainStatus || !chainOverallState || chainOverallState === 'RUNNING' || !chainRootId ||
        completedAttempts.current.has(chainRootId)) return;
    completedAttempts.current.add(chainRootId);
    const explicitlyStarted = explicitlyStartedAttempts.current.delete(chainRootId) ||
      explicitlyStartedAttempts.current.delete(chainStatus.currentAttemptId ?? '');
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelProductMappings.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
    ]).then(() => onSettled?.(chainStatus, explicitlyStarted));
  }, [chainOverallState, chainRootId, chainStatus, onSettled, queryClient]);

  return {
    stage,
    activeAttempt: activeAttemptForInput,
    serverStatus,
    extensionStatus: extensionStatusQuery.data ?? null,
    statusLoading: serverStatusQuery.isLoading || childStatusQuery.isLoading,
    statusFetching: serverStatusQuery.isFetching || childStatusQuery.isFetching,
    isStarting: startMutation.isPending,
    isStopping: cancelMutation.isPending,
    startError: startMutation.error,
    readError: serverStatusQuery.error ?? childStatusQuery.error,
    cancelError: cancelMutation.error,
    chainStatus,
    chainOverallState,
    start: (requestedAccountId?: string) => startMutation.mutateAsync(requestedAccountId),
    cancel: cancelMutation.mutateAsync,
    openAttention: async () => {
      const attemptId = activeAttemptForInput?.attemptId;
      const detected = extensionId ?? await detectExtensionId();
      if (!attemptId || !detected) throw new Error('수집 확인 탭을 찾을 수 없습니다.');
      await sendToExtension(detected, { action: 'openCollectionAttentionTab', attemptId });
    },
  };
}

function matchesInput(
  attempt: ActiveCoupangCatalogAttempt,
  channelAccountId: string | null,
  linkedAttemptId: string | null,
  stage: CoupangCatalogStage,
): boolean {
  const actualStage = attempt.stage ?? 'full';
  return (actualStage === stage || (stage === 'basics' && actualStage === 'full')) &&
    (!channelAccountId || attempt.channelAccountId === channelAccountId) &&
    (!linkedAttemptId || attempt.attemptId === linkedAttemptId);
}

function stageLabel(stage: CoupangCatalogStage): string {
  if (stage === 'basics') return '기본 목록';
  if (stage === 'details') return '전체 상세';
  return '상품';
}

function formatResumeAt(timestampMs: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestampMs);
}

function toTimestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function isCompletedBasicsRootWithoutChild(
  run: CoupangCatalogCollectionRun,
  rootAttemptId: string,
): boolean {
  return run.attemptId === rootAttemptId &&
    run.state === 'COMPLETE' &&
    (run.plan.stage ?? 'full') === 'basics' &&
    run.currentAttemptId === rootAttemptId &&
    run.currentStage === 'basics' &&
    (!run.rootAttemptId || run.rootAttemptId === rootAttemptId);
}

function isStandaloneCompletedBasicsRoot(
  run: CoupangCatalogCollectionRun,
  rootAttemptId: string,
): boolean {
  return isCompletedBasicsRootWithoutChild(run, rootAttemptId) &&
    run.plan.detailsIdempotencyKey == null;
}
