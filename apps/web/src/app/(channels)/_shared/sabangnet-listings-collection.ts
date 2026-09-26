'use client';

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { SABANGNET_MALL_LISTINGS_KIND, CHANNELS_OPERATION_CAPABILITY } from '@kiditem/shared/channels-operations';
import type { SabangnetMallListingsSource } from '@kiditem/shared/sabangnet-mall-listings';
import {
  COLLECTION_IDLE_POLL_MS,
  COLLECTION_RUNNING_POLL_MS,
  type CollectionSourceAdapter,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';
import { mallPublishingApi } from './mall-publishing-api';

export const SABANGNET_NO_MALL_ACCOUNTS =
  '사방넷 상품을 받을 몰 계정이 없습니다. 쇼핑몰 계정에서 몰을 먼저 연결해 주세요.';

function running(status: SabangnetMallListingsSource | undefined): boolean {
  const operation = status?.latestOperation;
  return operation?.status === 'executing' || operation?.status === 'prepared';
}

/** 사방넷 가져오기의 현재(몰 계정 행 + 이 kind의 최근 실행). 쇼핑몰 현황과 등록 현황이 같은 읽기를 쓴다. */
export function sabangnetListingsSourceQueryOptions() {
  return collectionSourceStatusQueryOptions<
    SabangnetMallListingsSource,
    Error,
    SabangnetMallListingsSource,
    QueryKey
  >({
    queryKey: queryKeys.mallPublishing.sabangnetListingsSource(),
    queryFn: () => mallPublishingApi.sabangnetListingsSource(),
    refetchInterval: (query) => (running(query.state.data) ? COLLECTION_RUNNING_POLL_MS : COLLECTION_IDLE_POLL_MS),
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  });
}

/** 확장에 `channels.sabangnet_mall_listings` 실행을 시작시킨다(KID-363). 몰 계정 행은 서버 plan이 얼린다. */
async function startSabangnetListings(): Promise<CollectionStartOutcome> {
  const outcome = await requestOperationStart(SABANGNET_MALL_LISTINGS_KIND, {}, { capability: CHANNELS_OPERATION_CAPABILITY });
  if (outcome.outcome === 'refused') return outcome;
  return { outcome: outcome.outcome, attemptId: outcome.operationId };
}

export type LinkImportedListingsResult = Readonly<{
  /** 연결을 돌린 몰 계정 수. */
  accounts: number;
  /** 연결하지 못한 몰 계정 수. */
  failedAccounts: number;
  /** 이번에 새로 셀피아 상품에 이어진 리스팅 수. 이미 이어진 리스팅은 세지 않는다. */
  matchedListings: number;
}>;

/**
 * 마지막으로 가져온 리스팅을 몰마다 셀피아 SKU 에 잇고, 몰 현황을 다시 읽는다.
 *
 * 가져오기 완료가 매칭을 대신 돌리지 않는다(원천 완료는 다음 계산을 부르지 않는다). 그래서
 * 화면이 매칭 owner 의 자동 매칭을 몰 계정마다 명시적으로 부른다 — 완료를 본 순간 한 번, 그리고
 * 사람이 '셀피아 상품에 연결'을 누를 때. 비어 있는 레시피만 채우므로 여러 번 불러도 결과는 같다.
 */
export async function linkImportedListings(
  queryClient: QueryClient,
): Promise<LinkImportedListingsResult> {
  const status = queryClient.getQueryData<SabangnetMallListingsSource>(
    queryKeys.mallPublishing.sabangnetListingsSource(),
  );
  const accounts = (status?.latestPublication ?? [])
    .filter((mall) => mall.listings > 0)
    .map((mall) => mall.channelAccountId);
  let failedAccounts = 0;
  let matchedListings = 0;
  for (const channelAccountId of accounts) {
    try {
      matchedListings += (await mallPublishingApi.autoMatchAccount(channelAccountId)).matchedListings;
    } catch {
      // 한 몰이 실패해도 나머지 몰은 잇는다. 실패한 몰은 버튼으로 다시 돌린다.
      failedAccounts += 1;
    }
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.mallPublishing.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuMappings.all }),
  ]);
  return { accounts: accounts.length, failedAccounts, matchedListings };
}

/**
 * 사방넷 송신 기록으로 몰 등록 상품을 가져오는 원천(KID-246) = `channels.sabangnet_mall_listings` 실행 하나(KID-363).
 * 확장이 실행을 열고 사방넷 목록을 끝까지 읽어 청크로 보내고, 서버 finish가 몰마다 발행한다. 중단은 이 브라우저의
 * 실행을 멈추고 서버 실행을 취소한다.
 */
export function sabangnetListingsCollection(): CollectionSourceAdapter<SabangnetMallListingsSource> {
  return {
    sourceKey: SABANGNET_MALL_LISTINGS_KIND,
    label: '사방넷 등록 상품 가져오기',
    statusQuery: sabangnetListingsSourceQueryOptions(),
    readRunning: (status) => {
      const operation = status.latestOperation;
      if (!operation || !running(status)) return null;
      const malls = Array.isArray(operation.plan?.malls) ? operation.plan.malls.length : 0;
      return { attemptId: operation.id, scopeLabel: `몰 ${malls}곳` };
    },
    readProgress: (status) => (running(status) && status.latestOperation
      ? `${status.latestOperation.id}:${JSON.stringify(status.latestOperation.progress ?? null)}`
      : null),
    start: () => startSabangnetListings(),
    cancelInExtension: (operationId) => requestOperationCancel(operationId),
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) => status.latestSucceeded?.id ?? null,
    onNewComplete: (queryClient) => {
      void linkImportedListings(queryClient);
    },
  };
}
