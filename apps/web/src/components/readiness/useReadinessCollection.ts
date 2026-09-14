import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  readCoupangCatalogCollectionLink,
  type CoupangCatalogCollectionLink,
  type CoupangCatalogCollectionLinkResult,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';
import type { ReadinessCheck } from '@kiditem/shared/readiness';

interface UseReadinessCollectionOptions {
  /** Disable catalog account reads while the readiness surface is closed. */
  catalogEnabled?: boolean;
  /** Reactive route handoff. `null` means this surface has no handoff query. */
  catalogLink?: CoupangCatalogCollectionLinkResult | null;
}

export interface ChannelAccountOption {
  id: string;
  channel: string;
  name?: string | null;
  isPrimary?: boolean | null;
}

/**
 * The Coupang account the readiness 상품 받기 control imports. Starting,
 * running state, refusal and stop belong to that account's shared collection
 * control, not to this state.
 */
export interface CatalogReadinessState {
  accounts: ChannelAccountOption[];
  accountsLoading: boolean;
  accountsError: unknown;
  accountId: string | null;
  accountLocked: boolean;
  setAccountId: (accountId: string | null) => void;
  linkError: string | null;
}

export function useReadinessCollection({
  catalogEnabled = false,
  catalogLink: catalogLinkOverride,
}: UseReadinessCollectionOptions) {
  const [initialCatalogLink] = useState(() => readCoupangCatalogCollectionLink());
  const catalogLink = catalogLinkOverride === undefined
    ? initialCatalogLink
    : catalogLinkOverride;
  const validCatalogLink = catalogLink && !('invalid' in catalogLink)
    ? catalogLink as CoupangCatalogCollectionLink
    : null;
  const malformedCatalogLink = Boolean(catalogLink && 'invalid' in catalogLink);
  const catalogLinkKey = validCatalogLink
    ? `${validCatalogLink.attemptId}:${validCatalogLink.channelAccountId}:${validCatalogLink.stage}`
    : malformedCatalogLink
      ? 'invalid'
      : 'none';
  const [catalogAccountId, setCatalogAccountId] = useState<string | null>(
    () => validCatalogLink?.channelAccountId ?? null,
  );
  const catalogAccountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => apiClient.get<ChannelAccountOption[]>('/api/channels/accounts'),
    enabled: catalogEnabled,
    staleTime: 60_000,
    retry: false,
  });
  const catalogAccounts = (Array.isArray(catalogAccountsQuery.data)
    ? catalogAccountsQuery.data
    : []).filter((account) => account.channel === 'coupang');
  const linkedAccountKnown = Boolean(validCatalogLink &&
    catalogAccounts.some((account) => account.id === validCatalogLink.channelAccountId));
  const catalogLinkError = malformedCatalogLink
    ? '상품 받기 링크가 올바르지 않습니다. 링크를 확인한 뒤 다시 시도해주세요.'
    : validCatalogLink && catalogAccountsQuery.isFetched && !linkedAccountKnown
      ? '연결된 쿠팡 계정을 찾을 수 없습니다. 링크의 계정 권한을 확인해주세요.'
      : null;
  useEffect(() => {
    // A route handoff names the account to import; otherwise keep the chosen
    // account while it stays active and fall back to the primary one.
    if (validCatalogLink) {
      setCatalogAccountId(validCatalogLink.channelAccountId);
      return;
    }
    if (catalogAccountId && catalogAccounts.some((account) => account.id === catalogAccountId)) return;
    const preferred = catalogAccounts.find((account) => account.isPrimary === true) ?? catalogAccounts[0];
    if (preferred) setCatalogAccountId(preferred.id);
  }, [catalogAccountId, catalogAccounts, catalogLinkKey, validCatalogLink]);

  // Every readiness source starts from its own shared control on the card.
  const handleCollect = async (_check: ReadinessCheck) => {
    toast.error('지원하지 않는 브라우저 수집 항목입니다.');
  };

  const catalog: CatalogReadinessState = {
    accounts: catalogAccounts,
    accountsLoading: catalogAccountsQuery.isLoading,
    accountsError: catalogAccountsQuery.error,
    accountId: catalogAccountId,
    accountLocked: Boolean(validCatalogLink),
    setAccountId: setCatalogAccountId,
    linkError: catalogLinkError,
  };

  return { handleCollect, catalog };
}
