'use client';

import {
  SellpiaProfitabilitySourceStatusSchema,
  type SellpiaProfitabilitySourceStatus,
} from '@kiditem/shared/source-import';
import type { QueryKey } from '@tanstack/react-query';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { handOffToExtensionRun, startWebOpenedCollection } from '@/lib/collection-start';
import { detectOrderCollectionExtensionRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import {
  beginSellpiaProductProfitabilitySourceAttempt,
  SELLPIA_PROFITABILITY_SOURCE_PATH,
} from '@/lib/sellpia-product-sales-api';

export const SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_ACTION = 'collectSellpiaProductProfit';
export const SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_CAPABILITY =
  'sellpiaProductProfitabilitySourceOwnerV1';

const RUNNING_POLL_MS = 2_000;

async function detectSellpiaProductProfitabilityExtension(): Promise<string> {
  const runtime = await detectOrderCollectionExtensionRuntime(1_200, [
    SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_CAPABILITY,
  ]);
  if (runtime.status === 'incompatible') {
    throw new Error('셀피아 수익성 수집을 지원하는 익스텐션으로 새로고침해 주세요.');
  }
  if (runtime.status !== 'ready') {
    throw new Error('셀피아 수익성 수집 익스텐션을 연결한 뒤 다시 시도해 주세요.');
  }
  return runtime.extensionId;
}

function cancelSellpiaProductProfitabilityAttempt(attemptId: string) {
  return apiClient.post(
    `${SELLPIA_PROFITABILITY_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`,
  );
}

/**
 * Sellpia product profitability for the shared control. The page opens the
 * owner attempt and hands it to the extension, which collects, uploads and
 * finalizes it. Collection never publishes ABC grades.
 */
export const sellpiaProductProfitabilityCollection: CollectionSourceAdapter<SellpiaProfitabilitySourceStatus> = {
  sourceKey: 'orders.sellpia_product_profitability',
  label: '셀피아 상품 손익 수집',
  statusQuery: collectionSourceStatusQueryOptions<
    SellpiaProfitabilitySourceStatus,
    Error,
    SellpiaProfitabilitySourceStatus,
    QueryKey
  >({
    queryKey: queryKeys.inventory.sellpiaProductProfitabilitySource(),
    queryFn: () =>
      apiClient.getParsed(
        `${SELLPIA_PROFITABILITY_SOURCE_PATH}/status`,
        SellpiaProfitabilitySourceStatusSchema,
      ),
    refetchInterval: (query) =>
      query.state.data?.latestAttempt?.state === 'RUNNING' ? RUNNING_POLL_MS : false,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const attempt = status.latestAttempt;
    return attempt?.state === 'RUNNING'
      ? { attemptId: attempt.attemptId, scopeLabel: `${attempt.plan.from} ~ ${attempt.plan.to}` }
      : null;
  },
  start: () =>
    startWebOpenedCollection({
      detectExtension: detectSellpiaProductProfitabilityExtension,
      begin: async (idempotencyKey) => {
        const attempt = await beginSellpiaProductProfitabilitySourceAttempt({ idempotencyKey });
        return { outcome: 'opened', attemptId: attempt.attemptId, running: attempt.state === 'RUNNING' };
      },
      handOff: ({ extensionId, attemptId }) =>
        handOffToExtensionRun(extensionId, {
          action: SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_ACTION,
          attemptId,
        }),
      cancel: ({ attemptId }) => cancelSellpiaProductProfitabilityAttempt(attemptId),
    }),
  cancelOnServer: cancelSellpiaProductProfitabilityAttempt,
  readCompleteId: (status) => status.latestComplete?.sourceImportRunId ?? null,
  // A new publication changes the profit evidence Product Management and stock analysis read.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.productSalesAll() });
  },
};
