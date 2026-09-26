'use client';

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  MALL_ADMIN_LISTING_READERS,
  MALL_ADMIN_LISTINGS_PRODUCER,
  type MallAdminListingMallKey,
  type MallAdminListingsSource,
  type MallAdminListingsSourceMall,
} from '@kiditem/shared/mall-admin-listings';
import {
  MALL_ADMIN_LISTINGS_KIND,
  isMallAdminListingOperationMall,
} from '@kiditem/shared/channels-operations';
import {
  COLLECTION_IDLE_POLL_MS,
  COLLECTION_RUNNING_POLL_MS,
  type CollectionSourceAdapter,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { stoppedAttempt } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { isApiError } from '@/lib/api-error';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { handOffToExtensionRun, startWebOpenedCollection } from '@/lib/collection-start';
import { detectOrderCollectionExtensionRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { mallPublishingApi } from './mall-publishing-api';

export const MALL_ADMIN_LISTINGS_CAPABILITY = 'mallAdminListingsSourceOwnerV1';
export const MALL_ADMIN_LISTINGS_ACTION = 'collectMallAdminListings';
export const MALL_ADMIN_NO_ACCOUNT =
  '이 몰의 계정이 없습니다. 쇼핑몰 계정에서 몰을 먼저 연결해 주세요.';

/** 몰 관리자 직접 가져오기의 현재. 몰마다 시도가 있고, 화면 하나가 이 읽기를 공유한다. */
export function mallAdminListingsSourceQueryOptions() {
  return collectionSourceStatusQueryOptions<
    MallAdminListingsSource,
    Error,
    MallAdminListingsSource,
    QueryKey
  >({
    queryKey: queryKeys.mallPublishing.mallAdminListingsSource(),
    queryFn: () => mallPublishingApi.mallAdminListingsSource(),
    // 실행 kind로 옮긴 몰의 실행이 돌면 도는 주기로 읽는다(옛 시도는 확장이 끝을 알려 준다).
    refetchInterval: (query) => ((query.state.data?.malls ?? []).some((mall) => operationRunning(mall))
      ? COLLECTION_RUNNING_POLL_MS
      : COLLECTION_IDLE_POLL_MS),
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  });
}

/** Channels 기타 kind(사방넷·몰 관리자·셀피아 수동매칭, KID-363)를 도는 확장 빌드가 `ping`에 싣는 표시. */
export const CHANNELS_OPERATION_CAPABILITY = 'channelsOperationKindsV1' as const;

function operationRunning(mall: MallAdminListingsSourceMall | null | undefined): boolean {
  const status = mall?.latestOperation?.status;
  return status === 'executing' || status === 'prepared';
}

/**
 * 화면이 보는 그 몰의 마지막 가져오기 — 실행 kind로 옮긴 1차 몰은 실행(`latestOperation`·`latestSucceeded`), 나머지 몰은
 * 옛 시도에서 읽는다. 멈춘 것은 실패가 아니다(이전에 가져온 결과가 그대로 쓰인다).
 */
export function mallAdminRunView(mall: MallAdminListingsSourceMall | null): Readonly<{
  completedAt: string | Date | null;
  stopped: boolean;
  failure: Readonly<{ errorCode: string | null; errorMessage: string | null }> | null;
}> {
  if (mall && isMallAdminListingOperationMall(mall.mallKey)) {
    const latest = mall.latestOperation;
    return {
      completedAt: mall.latestSucceeded?.finishedAt ?? null,
      stopped: latest?.status === 'cancelled',
      failure: latest?.status === 'failed' ? latest : null,
    };
  }
  const latest = mall?.latestAttempt ?? null;
  const stopped = stoppedAttempt(latest);
  return {
    completedAt: mall?.latestComplete?.completedAt ?? null,
    stopped,
    failure: latest?.state === 'FAILED' && !stopped && latest.errorMessage ? latest : null,
  };
}

/** 그 몰의 슬라이스. 아직 못 받았으면 null. */
export function mallFrom(
  status: MallAdminListingsSource | undefined,
  mallKey: MallAdminListingMallKey,
): MallAdminListingsSourceMall | null {
  return status?.malls.find((mall) => mall.mallKey === mallKey) ?? null;
}

/** 그 몰을 읽는 확장 기능들. 나중에 붙은 몰은 그 읽기기가 든 확장이어야 한다(옛 확장은 몰을 몰라 형식 오류로 멈춘다). */
export function mallAdminCapabilities(mallKey: MallAdminListingMallKey): string[] {
  const reader = MALL_ADMIN_LISTING_READERS[mallKey];
  return 'capability' in reader ? [MALL_ADMIN_LISTINGS_CAPABILITY, reader.capability] : [MALL_ADMIN_LISTINGS_CAPABILITY];
}

function startMallAdmin(mallKey: MallAdminListingMallKey): () => Promise<CollectionStartOutcome> {
  return () =>
    startWebOpenedCollection({
      detectExtension: async () => {
        const runtime = await detectOrderCollectionExtensionRuntime(1_200, mallAdminCapabilities(mallKey));
        if (runtime.status === 'incompatible') {
          throw new Error('주문수집 확장프로그램이 이전 버전입니다. 확장을 새로고침(1.2.23 이상)한 뒤 다시 가져와 주세요.');
        }
        if (runtime.status !== 'ready') {
          throw new Error('주문수집 확장프로그램을 찾지 못했습니다. 확장을 켜고 몰에 로그인한 뒤 다시 가져와 주세요.');
        }
        return runtime.extensionId;
      },
      begin: async (idempotencyKey) => {
        try {
          const attempt = await mallPublishingApi.beginMallAdminListings(mallKey, idempotencyKey);
          return { outcome: 'opened', attemptId: attempt.attemptId, running: attempt.state === 'RUNNING' };
        } catch (error) {
          if (isApiError(error) && error.status === 404) {
            return { outcome: 'refused', message: MALL_ADMIN_NO_ACCOUNT };
          }
          throw error;
        }
      },
      handOff: ({ extensionId, attemptId }) =>
        handOffToExtensionRun(extensionId, attemptId, { action: MALL_ADMIN_LISTINGS_ACTION, attemptId }),
      cancel: ({ attemptId }) => mallPublishingApi.cancelMallAdminListings(attemptId),
    });
}

export type LinkMallAdminResult = Readonly<{
  matchedListings: number;
  failed: boolean;
}>;

/**
 * 그 몰의 마지막 가져오기 리스팅을 셀피아 SKU 에 잇는다 — 매칭 owner 의 자동 매칭이다.
 * 가져오기 완료가 매칭을 대신 돌리지 않으므로 화면이 명시적으로 부른다. 비어 있는 레시피만
 * 채우니 여러 번 불러도 결과는 같다.
 */
export async function linkMallAdminListings(
  queryClient: QueryClient,
  mallKey: MallAdminListingMallKey,
): Promise<LinkMallAdminResult> {
  const status = queryClient.getQueryData<MallAdminListingsSource>(
    queryKeys.mallPublishing.mallAdminListingsSource(),
  );
  const mall = mallFrom(status, mallKey);
  if (!mall?.channelAccountId || !mall.latestPublication || mall.latestPublication.listings === 0) {
    return { matchedListings: 0, failed: false };
  }
  let matchedListings = 0;
  let failed = false;
  try {
    matchedListings = (await mallPublishingApi.autoMatchAccount(mall.channelAccountId)).matchedListings;
  } catch {
    failed = true;
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.mallPublishing.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuMappings.all }),
  ]);
  return { matchedListings, failed };
}

/**
 * 몰 하나의 관리자 직접 가져오기 원천(KID-246 2단계). 화면이 시도를 열어 확장에 넘기고,
 * 확장이 그 몰 상품 목록을 읽어 owner 에 제출한다.
 */
export function mallAdminListingsCollection(
  mallKey: MallAdminListingMallKey,
): CollectionSourceAdapter<MallAdminListingsSource> {
  if (isMallAdminListingOperationMall(mallKey)) return mallAdminListingsOperation(mallKey);
  return {
    sourceKey: `${MALL_ADMIN_LISTINGS_PRODUCER}:${mallKey}`,
    label: '몰 등록 상품 가져오기',
    statusQuery: mallAdminListingsSourceQueryOptions(),
    readStatusIdentity: (status) => mallFrom(status, mallKey)?.latestAttempt?.attemptId ?? null,
    readRunning: (status) => {
      const attempt = mallFrom(status, mallKey)?.latestAttempt;
      if (attempt?.state !== 'RUNNING') return null;
      return { attemptId: attempt.attemptId, scopeLabel: null };
    },
    start: startMallAdmin(mallKey),
    cancelOnServer: (attemptId) => mallPublishingApi.cancelMallAdminListings(attemptId),
    readCompleteId: (status) => mallFrom(status, mallKey)?.latestComplete?.attemptId ?? null,
    onNewComplete: (queryClient) => {
      void linkMallAdminListings(queryClient, mallKey);
    },
  };
}

/**
 * 1차 몰(`MALL_ADMIN_LISTING_OPERATION_MALLS`)의 가져오기 = `channels.mall_admin_listings` 실행 하나(KID-363). 확장이 실행을
 * 열고 그 몰 관리자 목록을 읽어 청크로 보내고, 서버 finish가 발행한다. 계정 행은 화면이 본 그 몰의 행을 scope로 싣고
 * 서버 plan이 몰 허브의 행과 같은지 다시 본다. 중단은 이 브라우저의 실행을 멈추고 서버 실행을 취소한다.
 */
function mallAdminListingsOperation(mallKey: MallAdminListingMallKey): CollectionSourceAdapter<MallAdminListingsSource> {
  return {
    sourceKey: `${MALL_ADMIN_LISTINGS_KIND}:${mallKey}`,
    label: '몰 등록 상품 가져오기',
    statusQuery: mallAdminListingsSourceQueryOptions(),
    readStatusIdentity: (status) => {
      const operation = mallFrom(status, mallKey)?.latestOperation;
      return operation ? `${operation.id}:${operation.status}` : null;
    },
    readRunning: (status) => {
      const mall = mallFrom(status, mallKey);
      return mall?.latestOperation && operationRunning(mall) ? { attemptId: mall.latestOperation.id, scopeLabel: null } : null;
    },
    readProgress: (status) => {
      const mall = mallFrom(status, mallKey);
      return mall?.latestOperation && operationRunning(mall)
        ? `${mall.latestOperation.id}:${JSON.stringify(mall.latestOperation.progress ?? null)}`
        : null;
    },
    start: async (_input, { status }) => {
      const channelAccountId = mallFrom(status, mallKey)?.channelAccountId;
      if (!channelAccountId) return { outcome: 'refused', message: MALL_ADMIN_NO_ACCOUNT };
      const outcome = await requestOperationStart(MALL_ADMIN_LISTINGS_KIND, { channelAccountId, mallKey }, { capability: CHANNELS_OPERATION_CAPABILITY });
      if (outcome.outcome === 'refused') return outcome;
      return { outcome: outcome.outcome, attemptId: outcome.operationId };
    },
    cancelInExtension: (operationId) => requestOperationCancel(operationId),
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) => mallFrom(status, mallKey)?.latestSucceeded?.id ?? null,
    onNewComplete: (queryClient) => {
      void linkMallAdminListings(queryClient, mallKey);
    },
  };
}
