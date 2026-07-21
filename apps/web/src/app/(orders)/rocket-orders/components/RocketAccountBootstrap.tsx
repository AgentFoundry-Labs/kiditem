'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ChannelAccountListItemSchema } from '@kiditem/shared/channel-account';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

const ChannelAccountListSchema = z.array(ChannelAccountListItemSchema);

/**
 * 화면에 아무것도 그리지 않고 활성 로켓 채널 계정을 자동 선택해 상위로 알린다.
 *
 * 기존 '쿠팡 로켓 발주 미리보기' 카드(사용자 요청으로 제거)의 계정 드롭다운이
 * 캘린더·날짜별 발주목록·차트의 데이터 기준이었다. 카드를 없애면서도 그 계정 선택은
 * 백그라운드로 유지하기 위한 헤드리스 컴포넌트다.
 */
export function RocketAccountBootstrap({
  onAccountChange,
}: {
  onAccountChange: (account: { id: string; vendorId: string | null }) => void;
}) {
  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => apiClient.getParsed('/api/channels/accounts', ChannelAccountListSchema),
  });
  const rocketAccount = (accountsQuery.data ?? []).find((account) => account.channel === 'rocket') ?? null;
  const accountId = rocketAccount?.id ?? '';
  const vendorId = rocketAccount?.vendorId ?? null;

  useEffect(() => {
    if (accountId) onAccountChange({ id: accountId, vendorId });
  }, [accountId, vendorId, onAccountChange]);

  return null;
}
