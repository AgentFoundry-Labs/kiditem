'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  SellpiaInventoryGenerationSchema,
  SellpiaSyncScopeSchema,
  type SellpiaInventoryFreshnessStatus,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import {
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import { invalidateSellpiaInventory } from './invalidate-sellpia-inventory';

export const SELLPIA_INVENTORY_SOURCE_PATH = '/api/inventory/sellpia-source';
export const SELLPIA_INVENTORY_SOURCE_ATTEMPT_STORAGE_PREFIX =
  'kiditem:inventory:sellpia-source-attempt';
export const SELLPIA_INVENTORY_EXTENSION_ACTION = 'collectSellpiaInventory';
export const SELLPIA_INVENTORY_EXTENSION_CAPABILITY =
  'sellpiaInventorySourceOwnerV1';

const SELLPIA_SOURCE_OWNER_TRIGGERS = [
  'initial_snapshot',
  'ttl_expired',
  'same_hash_confirmation',
  'purchase_preflight',
  'manual_request',
  'retry',
] as const;
const SellpiaSourceOwnerTriggerSchema = z.enum(SELLPIA_SOURCE_OWNER_TRIGGERS);

const SellpiaInventorySourcePlanSchema = z
  .object({
    sourceType: z.literal('sellpia_inventory'),
    parserVersion: z.literal('sellpia-inventory-v1'),
    scope: SellpiaSyncScopeSchema,
    trigger: SellpiaSourceOwnerTriggerSchema,
    sourceOrigin: z.literal('https://kiditem.sellpia.com'),
    sourceAccountKey: z.literal('kiditem'),
    generation: SellpiaInventoryGenerationSchema,
  })
  .strict();

export const SellpiaInventorySourceAttemptSchema = z
  .object({
    attemptId: z.string().uuid(),
    // The source-owner token is only returned to the owner boundary. The web
    // screen never persists or forwards it; the extension reads it itself.
    attemptToken: z.string().uuid(),
    generation: SellpiaInventoryGenerationSchema,
    state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
    plan: SellpiaInventorySourcePlanSchema,
    expiresAt: z.string().datetime({ offset: true }),
    actualCutoffAt: z.string().datetime({ offset: true }).nullable(),
    fileName: z.string().nullable(),
    fileHash: z.string().regex(/^[0-9a-f]{64}$/i).nullable(),
    contentChecksum: z.string().regex(/^[0-9a-f]{64}$/i).nullable(),
    rowCount: z.number().int().nonnegative(),
    errorCode: z.string().max(100).nullable(),
    errorMessage: z.string().max(300).nullable(),
  })
  .strict();

export type SellpiaInventorySourceAttempt = z.infer<
  typeof SellpiaInventorySourceAttemptSchema
>;
export type SellpiaInventorySourceOwnerTrigger = z.infer<
  typeof SellpiaSourceOwnerTriggerSchema
>;
type SellpiaInventorySourceStartTrigger = Extract<
  SellpiaInventorySourceOwnerTrigger,
  'manual_request' | 'purchase_preflight' | 'retry'
>;

export type ActiveSellpiaInventoryAttempt = {
  attemptId: string | null;
  idempotencyKey: string | null;
  trigger?: SellpiaInventorySourceStartTrigger | null;
};

const ActiveSellpiaInventoryAttemptSchema = z
  .object({
    attemptId: z.string().uuid().nullable(),
    idempotencyKey: z.string().uuid().nullable(),
    trigger: z.enum(['manual_request', 'purchase_preflight', 'retry']).nullable().optional(),
  })
  .strict();

/** The browser origin distinguishes local and office extension environments. */
export function getSellpiaInventoryEnvironmentKey(): string {
  if (typeof window === 'undefined') return 'server';
  const origin = window.location.origin;
  return origin && origin !== 'null'
    ? origin
    : `${window.location.protocol}//${window.location.host}`;
}

export function sellpiaInventorySourceAttemptStorageKey(
  organizationId: string,
  environmentKey = getSellpiaInventoryEnvironmentKey(),
): string {
  return [
    SELLPIA_INVENTORY_SOURCE_ATTEMPT_STORAGE_PREFIX,
    encodeURIComponent(organizationId),
    encodeURIComponent(environmentKey),
  ].join(':');
}

export function readActiveSellpiaInventoryAttempt(
  organizationId: string,
  environmentKey = getSellpiaInventoryEnvironmentKey(),
): ActiveSellpiaInventoryAttempt | null {
  if (!organizationId) return null;
  const raw = safeStorageGet(
    'local',
    sellpiaInventorySourceAttemptStorageKey(organizationId, environmentKey),
  );
  if (!raw) return null;
  try {
    const parsed = ActiveSellpiaInventoryAttemptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function rememberActiveSellpiaInventoryAttempt(
  organizationId: string,
  attempt: ActiveSellpiaInventoryAttempt,
  environmentKey = getSellpiaInventoryEnvironmentKey(),
): void {
  if (!organizationId) return;
  safeStorageSet(
    'local',
    sellpiaInventorySourceAttemptStorageKey(organizationId, environmentKey),
    JSON.stringify(attempt),
  );
}

export function readSellpiaInventorySourceAttempt(
  attemptId: string,
): Promise<SellpiaInventorySourceAttempt> {
  return apiClient
    .getParsed(
      `${SELLPIA_INVENTORY_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}`,
      SellpiaInventorySourceAttemptSchema,
    )
    .then((attempt) => {
      if (attempt.attemptId !== attemptId) {
        throw new Error('셀피아 재고 수집 시도 응답이 일치하지 않습니다.');
      }
      return attempt;
    });
}

export function beginSellpiaInventorySourceAttempt(
  idempotencyKey: string,
  trigger: Extract<
    SellpiaInventorySourceOwnerTrigger,
    'manual_request' | 'purchase_preflight' | 'retry'
  >,
): Promise<SellpiaInventorySourceAttempt> {
  return apiClient
    .post<unknown>(
      `${SELLPIA_INVENTORY_SOURCE_PATH}/attempts`,
      { scope: 'inventory', trigger },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    .then((response) => SellpiaInventorySourceAttemptSchema.parse(response));
}

export async function prepareSellpiaInventoryExtension(): Promise<string> {
  const runtime = await detectOrderCollectionExtensionRuntime(1_200, [
    SELLPIA_INVENTORY_EXTENSION_CAPABILITY,
  ]);
  if (runtime.status === 'incompatible') {
    throw new Error('셀피아 재고 수집을 지원하는 익스텐션으로 새로고침해 주세요.');
  }
  if (runtime.status !== 'ready') {
    throw new Error(
      '셀피아 재고 수집 익스텐션을 연결한 뒤 다시 시도해 주세요.',
    );
  }
  await transferExtensionAuthTo(runtime.extensionId);
  return runtime.extensionId;
}

export async function startSellpiaInventoryBrowser(
  extensionId: string,
  attemptId: string,
): Promise<void> {
  const response = await sendToExtension<{ success?: boolean; error?: string }>(
    extensionId,
    { action: SELLPIA_INVENTORY_EXTENSION_ACTION, attemptId },
    190_000,
  );
  if (response?.success === false) {
    throw new Error(response.error ?? '셀피아 재고 수집을 시작하지 못했습니다.');
  }
}

function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

type ActiveScope = {
  organizationId: string;
  environmentKey: string;
  attempt: ActiveSellpiaInventoryAttempt | null;
};

export type SellpiaInventorySourceOwnerState = {
  status: SellpiaInventoryFreshnessStatus;
  lastVerifiedAt: string | null;
  errorMessage: string | null;
  sourceBindingConfirmed: boolean;
};

/**
 * The stock screens own this source lifecycle. Reads on mount/reload only
 * observe the persisted owner attempt; provider work starts only from start().
 */
export function useSellpiaInventorySourceOwner({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? null;
  const environmentKey = getSellpiaInventoryEnvironmentKey();
  const [activeScope, setActiveScope] = useState<ActiveScope | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const startingRef = useRef(false);
  const invalidatedTerminalRef = useRef<string | null>(null);
  const observedVerifiedGenerationRef = useRef<{
    organizationId: string | null;
    generation: string | null;
  }>({ organizationId: null, generation: null });

  useEffect(() => {
    if (!organizationId) {
      setActiveScope(null);
      return;
    }
    setActiveScope({
      organizationId,
      environmentKey,
      attempt: readActiveSellpiaInventoryAttempt(organizationId, environmentKey),
    });
  }, [environmentKey, organizationId]);

  const scopedAttempt = activeScope?.organizationId === organizationId
    && activeScope.environmentKey === environmentKey
    ? activeScope.attempt
    : null;
  const freshnessQueryKey = [
    ...queryKeys.inventory.freshness(),
    organizationId ?? '',
  ] as const;
  const attemptQueryKey = queryKeys.inventory.sellpiaSourceAttempt(
    organizationId ?? '',
    scopedAttempt?.attemptId ?? '',
    environmentKey,
  );

  const attemptQuery = useQuery({
    queryKey: attemptQueryKey,
    queryFn: () => readSellpiaInventorySourceAttempt(scopedAttempt!.attemptId!),
    enabled: enabled && !!organizationId && !!scopedAttempt?.attemptId,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.state === 'RUNNING' ? 2_000 : false,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  });
  const freshness = useQuery({
    queryKey: freshnessQueryKey,
    queryFn: sellpiaInventoryFreshnessApi.getState,
    enabled: enabled && !!organizationId,
    retry: false,
    refetchInterval: (query) => {
      if (!enabled || !organizationId) return false;
      if (attemptQuery.data?.state === 'RUNNING' || query.state.data?.status === 'syncing') {
        return 2_000;
      }
      return 60_000;
    },
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  });

  const setScopedAttempt = useCallback((attempt: ActiveSellpiaInventoryAttempt) => {
    if (!organizationId) return;
    rememberActiveSellpiaInventoryAttempt(organizationId, attempt, environmentKey);
    setActiveScope({ organizationId, environmentKey, attempt });
  }, [environmentKey, organizationId]);

  const confirmSourceBinding = useCallback(async () => {
    if (!organizationId) {
      throw new Error('셀피아 계정 연결을 확인할 조직 정보가 없습니다. 다시 로그인해 주세요.');
    }
    setIsConfirming(true);
    try {
      const confirmed = await sellpiaInventoryFreshnessApi.confirmSourceBinding();
      queryClient.setQueryData(freshnessQueryKey, confirmed);
      return confirmed;
    } finally {
      setIsConfirming(false);
    }
  }, [freshnessQueryKey, organizationId, queryClient]);

  const start = useCallback(async (
    requestedTrigger?: SellpiaInventorySourceStartTrigger,
  ): Promise<SellpiaInventorySourceAttempt> => {
    if (!organizationId) {
      throw new Error('셀피아 재고 수집을 시작할 조직 정보가 없습니다. 다시 로그인해 주세요.');
    }
    if (startingRef.current) {
      throw new Error('셀피아 재고 수집이 이미 시작되었습니다.');
    }
    startingRef.current = true;
    setIsStarting(true);
    try {
      const invalidateTerminalAttempt = async (attempt: SellpiaInventorySourceAttempt) => {
        if (attempt.state !== 'COMPLETE' && attempt.state !== 'FAILED') return;
        if (invalidatedTerminalRef.current === attempt.attemptId) return;
        invalidatedTerminalRef.current = attempt.attemptId;
        if (attempt.state === 'COMPLETE') {
          await invalidateSellpiaInventory(queryClient);
        } else {
          await queryClient.invalidateQueries({ queryKey: freshnessQueryKey });
        }
      };
      const readAuthoritativeAttempt = async (attemptId: string) => {
        const current = await readSellpiaInventorySourceAttempt(attemptId);
        queryClient.setQueryData(
          queryKeys.inventory.sellpiaSourceAttempt(
            organizationId,
            current.attemptId,
            environmentKey,
          ),
          current,
        );
        await invalidateTerminalAttempt(current);
        return current;
      };
      let persisted = readActiveSellpiaInventoryAttempt(organizationId, environmentKey);
      let previousFailed = freshness.data?.status === 'failed';

      if (persisted?.attemptId) {
        let current: SellpiaInventorySourceAttempt | null = null;
        try {
          current = await readSellpiaInventorySourceAttempt(persisted.attemptId);
        } catch (error) {
          if (!isNotFound(error)) throw error;
          // A foreign/stale persisted ID must not block an explicit retry.
          persisted = { attemptId: null, idempotencyKey: null, trigger: null };
          setScopedAttempt(persisted);
        }
        if (current?.state === 'RUNNING') {
          const extensionId = await prepareSellpiaInventoryExtension();
          setScopedAttempt(persisted);
          queryClient.setQueryData(
            queryKeys.inventory.sellpiaSourceAttempt(
              organizationId,
              current.attemptId,
              environmentKey,
            ),
            current,
          );
          await startSellpiaInventoryBrowser(extensionId, current.attemptId);
          return await readAuthoritativeAttempt(current.attemptId);
        }
        if (current) {
          previousFailed = previousFailed || current.state === 'FAILED';
          persisted = { attemptId: null, idempotencyKey: null, trigger: null };
          setScopedAttempt(persisted);
        }
      }

      const extensionId = await prepareSellpiaInventoryExtension();
      const trigger = requestedTrigger
        ?? persisted?.trigger
        ?? (previousFailed ? 'retry' : 'manual_request');
      const idempotencyKey = persisted?.attemptId === null
        && persisted.idempotencyKey
        && persisted.trigger === trigger
        ? persisted.idempotencyKey
        : createSecureRandomUuid();

      // Persist the uncertain begin key before the request. A lost response
      // can then replay the exact explicit begin without creating a new run.
      setScopedAttempt({ attemptId: null, idempotencyKey, trigger });
      let started: SellpiaInventorySourceAttempt;
      try {
        started = await beginSellpiaInventorySourceAttempt(idempotencyKey, trigger);
      } catch (error) {
        // A client-visible 4xx is a definitive rejection, not an uncertain
        // admission. Keep the key only for network/5xx/schema uncertainty.
        if (isApiError(error) && error.status >= 400 && error.status < 500) {
          setScopedAttempt({ attemptId: null, idempotencyKey: null, trigger: null });
        }
        throw error;
      }
      const admitted = { attemptId: started.attemptId, idempotencyKey, trigger };
      setScopedAttempt(admitted);
      queryClient.setQueryData(
        queryKeys.inventory.sellpiaSourceAttempt(
          organizationId,
          started.attemptId,
          environmentKey,
        ),
        started,
      );

      if (started.state === 'RUNNING') {
        await startSellpiaInventoryBrowser(extensionId, started.attemptId);
        started = await readAuthoritativeAttempt(started.attemptId);
      } else {
        await invalidateTerminalAttempt(started);
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.inventory.sellpiaSourceAttempt(
            organizationId,
            started.attemptId,
            environmentKey,
          ),
        }),
        queryClient.invalidateQueries({ queryKey: freshnessQueryKey }),
      ]);
      return started;
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }, [
    environmentKey,
    freshness.data?.status,
    freshnessQueryKey,
    organizationId,
    queryClient,
    setScopedAttempt,
  ]);

  useEffect(() => {
    const attempt = attemptQuery.data;
    if (!attempt || (attempt.state !== 'COMPLETE' && attempt.state !== 'FAILED')) return;
    if (invalidatedTerminalRef.current === attempt.attemptId) return;
    invalidatedTerminalRef.current = attempt.attemptId;
    if (attempt.state === 'COMPLETE') {
      void invalidateSellpiaInventory(queryClient);
    } else {
      void queryClient.invalidateQueries({ queryKey: freshnessQueryKey });
    }
  }, [attemptQuery.data, freshnessQueryKey, queryClient]);

  useEffect(() => {
    const generation = freshness.data?.verifiedGeneration;
    if (generation === undefined || !organizationId) return;
    const previous = observedVerifiedGenerationRef.current;
    observedVerifiedGenerationRef.current = { organizationId, generation };
    if (previous.organizationId !== organizationId || previous.generation === null) return;
    if (previous.generation === generation) return;
    void invalidateSellpiaInventory(queryClient);
  }, [freshness.data?.verifiedGeneration, organizationId, queryClient]);

  const attempt = attemptQuery.data ?? null;
  const status = freshness.data?.status ?? null;
  const state: SellpiaInventorySourceOwnerState | null = status
    ? {
      status,
      lastVerifiedAt: freshness.data?.lastVerifiedAt ?? null,
      errorMessage: status === 'failed'
        ? freshness.data?.lastAttempt?.errorMessage ?? null
        : null,
      sourceBindingConfirmed: freshness.data?.sourceBinding?.confirmed ?? false,
    }
    : null;

  return {
    state,
    attempt,
    isStarting,
    isConfirming,
    isLoading: freshness.isLoading || attemptQuery.isLoading,
    error: attemptQuery.error ?? freshness.error,
    confirmSourceBinding,
    start,
  };
}
