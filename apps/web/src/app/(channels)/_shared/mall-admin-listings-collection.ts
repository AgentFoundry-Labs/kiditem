'use client';

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  type MallAdminListingMallKey,
  type MallAdminListingsSource,
  type MallAdminListingsSourceMall,
} from '@kiditem/shared/mall-admin-listings';
import { MALL_ADMIN_LISTINGS_KIND, CHANNELS_OPERATION_CAPABILITY } from '@kiditem/shared/channels-operations';
import {
  COLLECTION_IDLE_POLL_MS,
  COLLECTION_RUNNING_POLL_MS,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { noteOperationLoginFailureForMall, operationLoginOptions } from '@/lib/operation-login';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import { mallPublishingApi } from './mall-publishing-api';

export const MALL_ADMIN_NO_ACCOUNT =
  '이 몰의 계정이 없습니다. 쇼핑몰 계정에서 몰을 먼저 연결해 주세요.';

/** 몰 관리자 직접 가져오기의 현재. 몰마다 최근 실행이 있고, 화면 하나가 이 읽기를 공유한다. */
export function mallAdminListingsSourceQueryOptions() {
  return collectionSourceStatusQueryOptions<
    MallAdminListingsSource,
    Error,
    MallAdminListingsSource,
    QueryKey
  >({
    queryKey: queryKeys.mallPublishing.mallAdminListingsSource(),
    queryFn: async () => {
      const source = await mallPublishingApi.mallAdminListingsSource();
      // 그 몰의 실행이 로그인 화면에서 몰의 거절로 끝났으면 그 몰의 자동 로그인을 멈춘다(KID-377, 계정 잠금 방지).
      for (const mall of source.malls) {
        if (mall.latestOperation) noteOperationLoginFailureForMall(mall.mallKey, mall.latestOperation);
      }
      return source;
    },
    // 어느 몰의 실행이 돌면 도는 주기로 읽는다.
    refetchInterval: (query) => ((query.state.data?.malls ?? []).some((mall) => operationRunning(mall))
      ? COLLECTION_RUNNING_POLL_MS
      : COLLECTION_IDLE_POLL_MS),
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  });
}


function operationRunning(mall: MallAdminListingsSourceMall | null | undefined): boolean {
  const status = mall?.latestOperation?.status;
  return status === 'executing' || status === 'prepared';
}

/** 화면이 보는 그 몰의 마지막 가져오기 — 실행(`latestOperation`·`latestSucceeded`). 멈춘 것은 실패가 아니다(이전 결과가 그대로 쓰인다). */
export function mallAdminRunView(mall: MallAdminListingsSourceMall | null): Readonly<{
  completedAt: string | Date | null;
  stopped: boolean;
  failure: Readonly<{ errorCode: string | null; errorMessage: string | null }> | null;
}> {
  const latest = mall?.latestOperation ?? null;
  return {
    completedAt: mall?.latestSucceeded?.finishedAt ?? null,
    stopped: latest?.status === 'cancelled',
    failure: latest?.status === 'failed' ? latest : null,
  };
}

/** 그 몰의 슬라이스. 아직 못 받았으면 null. */
export function mallFrom(
  status: MallAdminListingsSource | undefined,
  mallKey: MallAdminListingMallKey,
): MallAdminListingsSourceMall | null {
  return status?.malls.find((mall) => mall.mallKey === mallKey) ?? null;
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
 * 몰 하나의 관리자 직접 가져오기 = `channels.mall_admin_listings` 실행 하나(KID-363·381). 확장이 실행을 열고 그 몰 관리자
 * 목록을 읽어 청크로 보내고, 서버 finish가 발행한다. 계정 행은 화면이 본 그 몰의 행을 scope로 싣고 서버 plan이 몰 허브의
 * 행과 같은지 다시 본다. 중단은 이 브라우저의 실행을 멈추고 서버 실행을 취소한다.
 */
export function mallAdminListingsCollection(mallKey: MallAdminListingMallKey): CollectionSourceAdapter<MallAdminListingsSource> {
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
      // 사람이 누른 가져오기다 — 그 몰의 저장 자격을 싣는다(확장이 `operationLoginV1`일 때만 실린다, KID-377).
      const outcome = await requestOperationStart(MALL_ADMIN_LISTINGS_KIND, { channelAccountId, mallKey }, {
        capability: CHANNELS_OPERATION_CAPABILITY,
        ...(await operationLoginOptions(mallKey, { automatic: false })),
      });
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
