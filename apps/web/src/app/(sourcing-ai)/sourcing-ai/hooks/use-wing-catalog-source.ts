'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ChannelAccountListItemSchema } from '@kiditem/shared/channel-account';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  latestWingCatalogAttempt,
  pickWingSearchAccount,
  sourcingWingCatalogCollection,
} from '../lib/sourcing-wing-source-owner';
import type { SourcingWingCatalogBatchInput } from '@kiditem/shared/sourcing';

const ChannelAccountListSchema = z.array(ChannelAccountListItemSchema);

/**
 * 소싱 화면 하나가 보는 공용 Wing 검색 소싱 컨트롤. 모든 화면이 같은 실행과 중단을 보고, 화면은 자기 키워드·용도를
 * 준다. 계정은 조직의 대표 쿠팡 계정이다(KID-360).
 */
export function useWingCatalogSource({ input }: { input: SourcingWingCatalogBatchInput }) {
  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => apiClient.getParsed('/api/channels/accounts', ChannelAccountListSchema),
  });
  const account = pickWingSearchAccount(accountsQuery.data);
  const accountId = account?.id ?? null;
  const accountName = account?.name ?? null;
  const readState = accountsQuery.data !== undefined ? 'read' : accountsQuery.isError ? 'failed' : 'loading';
  // 계정 목록을 읽기 전·읽기 실패엔 시작을 보내지 않고 그 까닭을 컨트롤 안내로 말한다.
  const adapter = useMemo(
    () => sourcingWingCatalogCollection(readState === 'read'
      ? { state: 'read', account: accountId ? { id: accountId, name: accountName ?? '' } : null }
      : { state: readState }),
    [readState, accountId, accountName],
  );
  const control = useCollectionSourceControl(adapter);
  return {
    control,
    account,
    attempt: latestWingCatalogAttempt(control.status),
    start: () => control.start(input),
  };
}

export type WingCatalogSource = ReturnType<typeof useWingCatalogSource>;
