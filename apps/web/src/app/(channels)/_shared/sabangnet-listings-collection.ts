'use client';

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { SabangnetMallListingsSource } from '@kiditem/shared/sabangnet-mall-listings';
import {
  COLLECTION_IDLE_POLL_MS,
  type CollectionSourceAdapter,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { isApiError } from '@/lib/api-error';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { handOffToExtensionRun, startWebOpenedCollection } from '@/lib/collection-start';
import { detectOrderCollectionExtensionRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { mallPublishingApi } from './mall-publishing-api';

export const SABANGNET_LISTINGS_CAPABILITY = 'sabangnetMallListingsSourceOwnerV1';
export const SABANGNET_LISTINGS_ACTION = 'collectSabangnetMallListings';
export const SABANGNET_NO_MALL_ACCOUNTS =
  '사방넷 상품을 받을 몰 계정이 없습니다. 쇼핑몰 계정에서 몰을 먼저 연결해 주세요.';

/** 사방넷 가져오기의 현재. 쇼핑몰 현황과 등록 현황이 같은 읽기를 쓴다. */
export function sabangnetListingsSourceQueryOptions() {
  return collectionSourceStatusQueryOptions<
    SabangnetMallListingsSource,
    Error,
    SabangnetMallListingsSource,
    QueryKey
  >({
    queryKey: queryKeys.mallPublishing.sabangnetListingsSource(),
    queryFn: () => mallPublishingApi.sabangnetListingsSource(),
    refetchInterval: COLLECTION_IDLE_POLL_MS,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  });
}

function startSabangnetListings(): Promise<CollectionStartOutcome> {
  return startWebOpenedCollection({
    detectExtension: async () => {
      const runtime = await detectOrderCollectionExtensionRuntime(1_200, [SABANGNET_LISTINGS_CAPABILITY]);
      if (runtime.status === 'incompatible') {
        throw new Error('주문수집 확장프로그램이 이전 버전입니다. 확장을 새로고침(1.0.97 이상)한 뒤 다시 가져와 주세요.');
      }
      if (runtime.status !== 'ready') {
        throw new Error('주문수집 확장프로그램을 찾지 못했습니다. 확장을 켜고 사방넷에 로그인한 뒤 다시 가져와 주세요.');
      }
      return runtime.extensionId;
    },
    begin: async (idempotencyKey) => {
      try {
        const attempt = await mallPublishingApi.beginSabangnetListings(idempotencyKey);
        return { outcome: 'opened', attemptId: attempt.attemptId, running: attempt.state === 'RUNNING' };
      } catch (error) {
        if (isApiError(error) && error.status === 404) {
          return { outcome: 'refused', message: SABANGNET_NO_MALL_ACCOUNTS };
        }
        throw error;
      }
    },
    handOff: ({ extensionId, attemptId }) =>
      handOffToExtensionRun(extensionId, attemptId, { action: SABANGNET_LISTINGS_ACTION, attemptId }),
    cancel: ({ attemptId }) => mallPublishingApi.cancelSabangnetListings(attemptId),
  });
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
 * 사방넷 송신 기록으로 몰 등록 상품을 가져오는 원천(KID-246). 화면이 시도를 열어 확장에
 * 넘기고, 확장이 사방넷 목록을 한 번에 읽어 owner 에 제출한다.
 */
export function sabangnetListingsCollection(): CollectionSourceAdapter<SabangnetMallListingsSource> {
  return {
    sourceKey: 'orders.sabangnet_mall_listings',
    label: '사방넷 등록 상품 가져오기',
    statusQuery: sabangnetListingsSourceQueryOptions(),
    readRunning: (status) => {
      const attempt = status.latestAttempt;
      if (attempt?.state !== 'RUNNING') return null;
      return { attemptId: attempt.attemptId, scopeLabel: `몰 ${attempt.plan.malls.length}곳` };
    },
    start: () => startSabangnetListings(),
    cancelOnServer: (attemptId) => mallPublishingApi.cancelSabangnetListings(attemptId),
    readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
    onNewComplete: (queryClient) => {
      void linkImportedListings(queryClient);
    },
  };
}
