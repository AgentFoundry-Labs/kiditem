'use client';

import { z } from 'zod';
import { ChannelAccountListItemSchema } from '@kiditem/shared/channel-account';
import { OperationFinishResponseSchema, OperationListResponseSchema, type OperationView } from '@kiditem/shared/operation';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/**
 * Wing 일별 사실 실행 kind(트래픽 `advertising.wing_traffic`·아이템위너 `advertising.wing_itemwinner`, KID-362)의
 * 화면 공용 부분. 두 kind를 도는 확장 빌드는 `ping`에 이 표시를 싣는다 — 없는 빌드엔 시작을 보내지 않는다.
 */
export const WING_DAILY_OPERATION_CAPABILITY = 'wingDailyOperationKindsV1' as const;
export const WING_COUPANG_ACCOUNT_REQUIRED = '연결된 쿠팡 계정이 없습니다. 채널 설정에서 쿠팡 Wing 계정을 먼저 연결해 주세요.';

/** Wing 계정: 활성 쿠팡 계정 중 대표 계정, 없으면 첫 계정. 쿠팡 계정이 없으면 null. */
export async function readPrimaryCoupangAccountId(): Promise<string | null> {
  const accounts = z.array(ChannelAccountListItemSchema).parse(await apiClient.get<unknown>('/api/channels/accounts'));
  const coupang = accounts.filter((account) => account.channel === 'coupang');
  return (coupang.find((candidate) => candidate.isPrimary) ?? coupang[0])?.id ?? null;
}

export async function resolvePrimaryCoupangAccountId(): Promise<string> {
  const accountId = await readPrimaryCoupangAccountId();
  if (!accountId) throw new Error(WING_COUPANG_ACCOUNT_REQUIRED);
  return accountId;
}

const PRIMARY_COUPANG_ACCOUNT_STALE_MS = 10 * 60_000;

/** 대표 쿠팡 계정 — 따로 오래 두는 읽기(수집 상태 폴링마다 다시 읽지 않는다). */
export function primaryCoupangAccountId(client: QueryClient): Promise<string | null> {
  return client.fetchQuery({
    queryKey: [...queryKeys.channelAccounts.all, 'primary-coupang'],
    queryFn: readPrimaryCoupangAccountId,
    staleTime: PRIMARY_COUPANG_ACCOUNT_STALE_MS,
  });
}

export function isLiveOperation(operation: OperationView): boolean {
  return operation.status === 'executing' || operation.status === 'prepared';
}

/**
 * 실행 목록 읽기. 지난 읽기에 도는 실행이 있으면 그 실행 하나(`GET /api/operations/:id`)만 다시 읽고, 끝났을 때만
 * 목록을 다시 읽는다 — 2초 폴링이 API 제한(분당 120)을 넘지 않게(KID-362 S3, `order-operations.ts` 선례).
 */
export async function refreshedOperations(
  client: QueryClient,
  queryKey: QueryKey,
  listPath: string,
): Promise<OperationView[]> {
  const previous = client.getQueryData<{ operations?: readonly OperationView[] }>(queryKey)?.operations ?? [];
  const live = previous.find(isLiveOperation);
  if (live) {
    const { operation } = OperationFinishResponseSchema.parse(await apiClient.get(`/api/operations/${encodeURIComponent(live.id)}`));
    if (isLiveOperation(operation)) return previous.map((entry) => (entry.id === operation.id ? operation : entry));
  }
  return OperationListResponseSchema.parse(await apiClient.get(listPath)).operations;
}
