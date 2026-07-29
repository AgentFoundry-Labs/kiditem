'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ChannelAccountListItemSchema,
  type ChannelAccountListItem,
} from '@kiditem/shared/channel-account';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

const ChannelAccountListSchema = z.array(ChannelAccountListItemSchema);
const BOOTSTRAP_PATH = '/api/channels/accounts/rocket/bootstrap';

export function useRocketChannelAccounts() {
  const queryClient = useQueryClient();
  const attemptedIdentityRef = useRef<string | null>(null);
  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => apiClient.getParsed('/api/channels/accounts', ChannelAccountListSchema),
  });
  const accounts = accountsQuery.data ?? [];
  const rocketAccounts = useMemo(
    () => accounts.filter((account) => account.channel === 'rocket'),
    [accounts],
  );
  const detectedCoupangAccount = accounts.find((account) =>
    account.channel === 'coupang'
    && account.isPrimary
    && Boolean(account.vendorId?.trim() || account.externalAccountId?.trim()));
  const detectedIdentityKey = detectedCoupangAccount
    ? `${detectedCoupangAccount.id}:${
      detectedCoupangAccount.vendorId?.trim()
      || detectedCoupangAccount.externalAccountId?.trim()
    }`
    : null;

  const bootstrap = useMutation({
    mutationFn: async () => ChannelAccountListItemSchema.parse(
      await apiClient.post<unknown>(BOOTSTRAP_PATH, {}),
    ),
    onSuccess: (account) => {
      queryClient.setQueryData<ChannelAccountListItem[]>(
        queryKeys.channelAccounts.active(),
        (current) => {
          const rows = current ?? [];
          const existingIndex = rows.findIndex(({ id }) => id === account.id);
          if (existingIndex < 0) return [...rows, account];
          return rows.map((row, index) => index === existingIndex ? account : row);
        },
      );
    },
  });
  const {
    mutate: bootstrapAccount,
    isPending: bootstrapPending,
    isError: bootstrapFailed,
    error: bootstrapError,
  } = bootstrap;

  useEffect(() => {
    if (
      !accountsQuery.isSuccess
      || rocketAccounts.length > 0
      || !detectedIdentityKey
      || bootstrapPending
      || attemptedIdentityRef.current === detectedIdentityKey
    ) {
      return;
    }
    attemptedIdentityRef.current = detectedIdentityKey;
    bootstrapAccount();
  }, [
    accountsQuery.isSuccess,
    bootstrapAccount,
    bootstrapPending,
    detectedIdentityKey,
    rocketAccounts.length,
  ]);

  const shouldBootstrap = accountsQuery.isSuccess
    && rocketAccounts.length === 0
    && detectedIdentityKey !== null
    && !bootstrapFailed;

  return {
    accounts,
    rocketAccounts,
    isLoading: accountsQuery.isLoading,
    isSuccess: accountsQuery.isSuccess,
    isBootstrapping: bootstrapPending || shouldBootstrap,
    error: bootstrapError ?? accountsQuery.error,
  };
}
