'use client';

import { useMemo } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { z } from 'zod';
import {
  SellpiaInventoryGenerationSchema,
  SellpiaSyncScopeSchema,
  type SellpiaInventoryFreshnessStatus,
  type SellpiaInventoryFreshnessView,
} from '@kiditem/shared/sellpia-inventory-freshness';
import {
  useCollectionSourceControl,
  type CollectionRunning,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { handOffToExtensionRun, startWebOpenedCollection } from '@/lib/collection-start';
import { detectOrderCollectionExtensionRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import { invalidateSellpiaInventory } from './invalidate-sellpia-inventory';

export const SELLPIA_INVENTORY_SOURCE_PATH = '/api/inventory/sellpia-source';
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

async function detectSellpiaInventoryExtension(): Promise<string> {
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
  return runtime.extensionId;
}

function cancelSellpiaInventoryAttempt(attemptId: string) {
  return apiClient.post(
    `${SELLPIA_INVENTORY_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`,
  );
}

export type SellpiaInventorySourceOwnerState = {
  status: SellpiaInventoryFreshnessStatus;
  lastVerifiedAt: string | null;
  errorMessage: string | null;
  sourceBindingConfirmed: boolean;
  /** The last attempt was stopped; the previous snapshot stays in use. */
  stopped: boolean;
};

/**
 * The owner's freshness read names the attempt holding the live lease, so every
 * browser shows and stops the same collection. A manual upload holds the lease
 * without an attempt and shows as running without a stop.
 */
function sellpiaInventoryRunning(freshness: SellpiaInventoryFreshnessView): CollectionRunning | null {
  if (freshness.activeSync) {
    return { attemptId: freshness.activeSync.attemptId, scopeLabel: null };
  }
  return freshness.status === 'syncing' ? { attemptId: null, scopeLabel: null } : null;
}

const SOURCE_RUNNING_POLL_MS = 2_000;
const SOURCE_IDLE_POLL_MS = 60_000;

/**
 * Sellpia inventory collection for the shared control. The page opens the
 * owner attempt and hands it to the extension; the extension collects,
 * uploads and finalizes it.
 */
export function sellpiaInventoryCollection({
  organizationId,
}: Readonly<{
  organizationId: string | null;
}>): CollectionSourceAdapter<SellpiaInventoryFreshnessView> {
  return {
    sourceKey: 'inventory.sellpia',
    label: '셀피아 재고 수집',
    statusQuery: collectionSourceStatusQueryOptions<
      SellpiaInventoryFreshnessView,
      Error,
      SellpiaInventoryFreshnessView,
      QueryKey
    >({
      queryKey: queryKeys.inventory.sellpiaSource(organizationId ?? ''),
      queryFn: () => sellpiaInventoryFreshnessApi.getState(),
      enabled: Boolean(organizationId),
      refetchInterval: (query) =>
        query.state.data && sellpiaInventoryRunning(query.state.data)
          ? SOURCE_RUNNING_POLL_MS
          : SOURCE_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: sellpiaInventoryRunning,
    start: (_input, { status }) =>
      startWebOpenedCollection({
        detectExtension: detectSellpiaInventoryExtension,
        begin: async (idempotencyKey) => {
          const trigger = status?.status === 'failed' ? 'retry' : 'manual_request';
          const started = await beginSellpiaInventorySourceAttempt(idempotencyKey, trigger);
          return { outcome: 'opened', attemptId: started.attemptId, running: started.state === 'RUNNING' };
        },
        handOff: ({ extensionId, attemptId }) =>
          handOffToExtensionRun(extensionId, { action: SELLPIA_INVENTORY_EXTENSION_ACTION, attemptId }),
        cancel: ({ attemptId }) => cancelSellpiaInventoryAttempt(attemptId),
      }),
    cancelOnServer: cancelSellpiaInventoryAttempt,
    readCompleteId: (freshness) => freshness.verifiedGeneration,
    // A newer verified generation republished the snapshot every stock screen reads.
    onNewComplete: (queryClient) => {
      void invalidateSellpiaInventory(queryClient);
    },
  };
}

/**
 * The Sellpia inventory collection control with the freshness state its
 * screens show. Every mounted copy shares start, stop and running state.
 */
export function useSellpiaInventoryCollection({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const organizationId = enabled ? user?.organizationId ?? null : null;
  const adapter = useMemo(
    () => sellpiaInventoryCollection({ organizationId }),
    [organizationId],
  );
  const control = useCollectionSourceControl(adapter);
  const statusQueryKey = adapter.statusQuery.queryKey;
  const binding = useMutation({
    mutationFn: sellpiaInventoryFreshnessApi.confirmSourceBinding,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statusQueryKey, exact: true }),
  });
  const freshness = control.status;
  const state: SellpiaInventorySourceOwnerState | null = freshness
    ? {
      status: freshness.status,
      lastVerifiedAt: freshness.lastVerifiedAt,
      errorMessage: freshness.status === 'failed'
        ? freshness.lastAttempt?.errorMessage ?? null
        : null,
      sourceBindingConfirmed: freshness.sourceBinding.confirmed,
      stopped: freshness.status !== 'syncing' && freshness.lastAttempt?.status === 'cancelled',
    }
    : null;

  return {
    control,
    state,
    confirmSourceBinding: binding.mutateAsync,
    isConfirming: binding.isPending,
  };
}
