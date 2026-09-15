'use client';

import type {
  CollectionSourceAdapter,
  CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { startWebOpenedCollection } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
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

function runningBatch(batch: WingRankCurrentBatch | null): WingRankCurrentBatch | null {
  return batch?.attempts.some((attempt) => attempt.state === 'RUNNING') ? batch : null;
}

function startWingRankBatch(): Promise<CollectionStartOutcome> {
  return startWebOpenedCollection({
    detectExtension: async () => {
      const gate = await detectRankExtensionGate();
      if (gate.status !== 'ready') {
        throw new Error(
          rankExtensionGateMessage(gate) ?? 'Wing 판매순위 수집 확장프로그램을 확인할 수 없습니다.',
        );
      }
      return gate.extensionId;
    },
    // The owner admits a batch of keyword attempts under the start's key.
    begin: async (batchKey) => {
      const admitted = await beginWingRankBatch(batchKey);
      const first =
        admitted.attempts.find((attempt) => attempt.state === 'RUNNING') ?? admitted.attempts[0];
      if (!first) return { outcome: 'refused', message: '순위를 확인할 자사 상품이 없습니다.' };
      return { outcome: 'opened', attemptId: first.attemptId, running: first.state === 'RUNNING' };
    },
    // The extension accepts the batch at once and works through its keywords.
    handOff: async ({ extensionId, idempotencyKey }) => {
      await runWingSalesRankCheck(extensionId, idempotencyKey);
    },
    cancel: ({ idempotencyKey }) => cancelWingRankBatchOnServer(idempotencyKey),
  });
}

function batchKeyOf(batch: WingRankCurrentBatch | null | undefined): string {
  if (!batch) throw new Error('중단할 Wing 판매순위 수집을 찾지 못했습니다.');
  return batch.batchKey;
}

/**
 * The extension runs the whole batch, one keyword attempt after another, so it
 * stops the batch by its key rather than one keyword's session.
 */
async function stopWingRankBatchInExtension(batchKey: string): Promise<void> {
  const gate = await detectRankExtensionGate();
  if (gate.status !== 'ready') throw new Error('no Wing rank extension to stop the batch');
  await cancelWingRankBatch(gate.extensionId, batchKey);
}

/**
 * The organization's Wing sales-rank batch for the shared control. One start
 * admits a batch of keyword attempts under a key. The running collection names
 * its current keyword attempt; stop ends the whole batch by its key, in the
 * extension and with the owner.
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
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (batch) => {
    const current = batch?.attempts.find((attempt) => attempt.state === 'RUNNING');
    if (!batch || !current) return null;
    const settled = batch.attempts.filter((attempt) => attempt.state !== 'RUNNING').length;
    return {
      attemptId: current.attemptId,
      scopeLabel: `${settled}/${batch.attempts.length}개 키워드`,
    };
  },
  start: () => startWingRankBatch(),
  cancelInExtension: (_attemptId, { status }) => stopWingRankBatchInExtension(batchKeyOf(status)),
  cancelOnServer: (_attemptId, { status }) => cancelWingRankBatchOnServer(batchKeyOf(status)),
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
