'use client';

import {
  CoupangCatalogSourceStatusSchema,
  type CoupangCatalogCollectionRun,
  type CoupangCatalogSourceStatus,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestCollectionStart } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import type { QueryKey } from '@tanstack/react-query';

const RUNNING_POLL_MS = 2_000;
const WING_RATE_LIMITED = 'WING_PROVIDER_RATE_LIMITED';

export type CoupangCatalogAccount = Readonly<{ id: string; name: string | null }>;

function catalogImportPath(channelAccountId: string): string {
  return `/api/channels/accounts/${encodeURIComponent(channelAccountId)}/catalog-imports/coupang-wing`;
}

/** The whole import's state: the root attempt's state across the basics-to-details handoff. */
export function catalogImportState(status: CoupangCatalogSourceStatus | undefined) {
  const root = status?.latestAttempt;
  return root ? (root.overallState ?? root.state) : null;
}

/** The attempt the import is on: its details child once admitted, otherwise the root. */
export function currentCatalogAttempt(
  status: CoupangCatalogSourceStatus | undefined,
): CoupangCatalogCollectionRun | null {
  return status?.detailsAttempt ?? status?.latestAttempt ?? null;
}

/**
 * A Wing rate limit pauses the import until the operator resumes it. Once its
 * not-before time passed, 상품 받기 resumes that same attempt, so the control
 * offers the start again instead of showing the paused import as running.
 */
export function catalogImportResumable(
  status: CoupangCatalogSourceStatus | undefined,
  nowMs = Date.now(),
): boolean {
  if (catalogImportState(status) !== 'RUNNING') return false;
  const error = currentCatalogAttempt(status)?.error;
  if (error?.code !== WING_RATE_LIMITED) return false;
  const notBefore = error.notBefore ? new Date(error.notBefore).getTime() : Number.NaN;
  return !Number.isFinite(notBefore) || notBefore <= nowMs;
}

/** An operator, or the extension on the operator's behalf, stopped the import. */
export function catalogImportStopped(status: CoupangCatalogSourceStatus | undefined): boolean {
  return catalogImportState(status) === 'FAILED' &&
    Boolean(currentCatalogAttempt(status)?.error?.code.endsWith('_CANCELLED'));
}

/**
 * The account's latest import read, shared by every control and progress view
 * for the account. Progress views read it without the control, so it keeps its
 * own running poll.
 */
export function coupangCatalogSourceQueryOptions(channelAccountId: string) {
  return collectionSourceStatusQueryOptions<
    CoupangCatalogSourceStatus,
    Error,
    CoupangCatalogSourceStatus,
    QueryKey
  >({
    queryKey: queryKeys.coupangCatalogImports.source(channelAccountId),
    queryFn: async () =>
      CoupangCatalogSourceStatusSchema.parse(
        await apiClient.get(`${catalogImportPath(channelAccountId)}/source`),
      ),
    refetchInterval: (query) =>
      catalogImportState(query.state.data) === 'RUNNING' ? RUNNING_POLL_MS : false,
    meta: { suppressGlobalErrorToast: true },
  });
}

/**
 * One store account's Wing catalog import (상품 받기) for the shared control.
 * The extension admits it through the start contract because a browser reads
 * Wing through one Wing login and imports one account at a time; the page never
 * opens the attempt. The root attempt names the import, so running state and
 * stop follow it across the basics-to-details handoff.
 */
export function coupangCatalogCollection(
  account: CoupangCatalogAccount,
): CollectionSourceAdapter<CoupangCatalogSourceStatus> {
  return {
    sourceKey: `channels.coupang_catalog:${account.id}`,
    label: '쿠팡 상품 받기',
    statusQuery: coupangCatalogSourceQueryOptions(account.id),
    readRunning: (status) => {
      const root = status.latestAttempt;
      if (!root || catalogImportState(status) !== 'RUNNING' || catalogImportResumable(status)) {
        return null;
      }
      return { attemptId: root.attemptId, scopeLabel: account.name };
    },
    start: () => requestCollectionStart('channels.coupang_catalog', { channelAccountId: account.id }),
    cancelOnServer: (attemptId) =>
      apiClient.post(`${catalogImportPath(account.id)}/attempts/${encodeURIComponent(attemptId)}/cancel`),
    readCompleteId: (status) =>
      catalogImportState(status) === 'COMPLETE' ? (status.latestAttempt?.attemptId ?? null) : null,
    // A completed import refreshes what the catalog screens and readiness read.
    onNewComplete: (queryClient) => {
      for (const queryKey of [
        queryKeys.channelListings.all,
        queryKeys.products.operations.all,
        queryKeys.channelProductMappings.all,
        queryKeys.channelSkuAvailability.all,
        ['readiness'],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  };
}
