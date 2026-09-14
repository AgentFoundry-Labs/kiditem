'use client';

import type {
  CollectionSourceAdapter,
  CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { attemptInProgress } from '@/lib/collection-start';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  beginWingRankBatch,
  cancelWingRankBatchOnServer,
  readCurrentWingRankBatch,
} from './rank-api';
import {
  cancelWingRankBatch,
  detectRankExtensionGate,
  rankExtensionGateMessage,
  runWingSalesRankCheck,
} from './rank-extension';
import type { QueryKey } from '@tanstack/react-query';
import type { WingRankCurrentBatch } from '@kiditem/shared/advertising';

const RUNNING_POLL_MS = 2_000;

function runningBatch(batch: WingRankCurrentBatch | null): WingRankCurrentBatch | null {
  return batch?.attempts.some((attempt) => attempt.state === 'RUNNING') ? batch : null;
}

async function startWingRankBatch(): Promise<CollectionStartOutcome> {
  const gate = await detectRankExtensionGate();
  if (gate.status !== 'ready') {
    throw new Error(
      rankExtensionGateMessage(gate) ?? 'Wing 판매순위 수집 확장프로그램을 확인할 수 없습니다.',
    );
  }
  await transferExtensionAuthTo(gate.extensionId);
  const batchKey = createSecureRandomUuid();
  let admitted: Awaited<ReturnType<typeof beginWingRankBatch>>;
  try {
    admitted = await beginWingRankBatch(batchKey);
  } catch (error) {
    if (!attemptInProgress(error)) throw error;
    // A keyword of the current batch is still running; the current batch read names it.
    return { outcome: 'running', attemptId: null };
  }
  if (admitted.attempts.length === 0) {
    return { outcome: 'refused', message: '순위를 확인할 자사 상품이 없습니다.' };
  }
  // The extension works through the batch and the owner reports each keyword.
  void runWingSalesRankCheck(gate.extensionId, batchKey).catch(() => undefined);
  return { outcome: 'started', attemptId: batchKey };
}

async function stopWingRankBatch(batchKey: string): Promise<void> {
  // The extension stops its worker and cancels with the owner; the owner route decides either way.
  const gate = await detectRankExtensionGate().catch(() => null);
  if (gate?.status === 'ready') {
    await cancelWingRankBatch(gate.extensionId, batchKey).catch(() => undefined);
  }
  await cancelWingRankBatchOnServer(batchKey);
}

/**
 * The organization's Wing sales-rank batch for the shared control. One start
 * admits a batch of keyword attempts under a key; the control runs, shows and
 * stops the whole batch by that key.
 */
export const wingRankBatchCollection: CollectionSourceAdapter<WingRankCurrentBatch | null> = {
  sourceKey: 'advertising.wing_rank',
  label: 'Wing 판매순위 수집',
  statusQuery: collectionSourceStatusQueryOptions<
    WingRankCurrentBatch | null,
    Error,
    WingRankCurrentBatch | null,
    QueryKey
  >({
    queryKey: queryKeys.ads.wingRankCurrentBatch(),
    queryFn: readCurrentWingRankBatch,
    refetchInterval: (query) => (runningBatch(query.state.data ?? null) ? RUNNING_POLL_MS : false),
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (batch) => {
    const running = runningBatch(batch);
    if (!running) return null;
    const settled = running.attempts.filter((attempt) => attempt.state !== 'RUNNING').length;
    return {
      attemptId: running.batchKey,
      scopeLabel: `${settled}/${running.attempts.length}개 키워드`,
    };
  },
  start: () => startWingRankBatch(),
  cancelOnServer: stopWingRankBatch,
  readCompleteId: (batch) =>
    batch && batch.attempts.length > 0 && !runningBatch(batch) ? batch.batchKey : null,
  // A finished batch republished rank snapshots the rank, dashboard, traffic and readiness reads use.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    void queryClient.invalidateQueries({ queryKey: ['traffic'] });
    void queryClient.invalidateQueries({ queryKey: ['readiness'] });
  },
};
