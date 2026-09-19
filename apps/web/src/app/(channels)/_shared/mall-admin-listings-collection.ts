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
  type CollectionSourceAdapter,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
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
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  });
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
          throw new Error('주문수집 확장프로그램이 이전 버전입니다. 확장을 새로고침(1.2.22 이상)한 뒤 다시 가져와 주세요.');
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
