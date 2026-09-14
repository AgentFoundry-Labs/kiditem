import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  type CoupangCatalogBrowserStatus,
  type CoupangCatalogCollectionRun,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  readActiveCoupangCatalogAttempt,
  readActiveCoupangCatalogAttemptForStage,
  readCoupangCatalogCollectionLink,
  type CoupangCatalogCollectionLink,
  type CoupangCatalogCollectionLinkResult,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';
import { useCoupangCatalogImport } from '@/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport';
import type { ReadinessCheck } from '@kiditem/shared/readiness';

interface UseReadinessCollectionOptions {
  refetchReadiness: () => Promise<unknown>;
  /** Disable catalog account/status reads while the readiness surface is closed. */
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

export interface CatalogReadinessState {
  accounts: ChannelAccountOption[];
  accountsLoading: boolean;
  accountsError: unknown;
  accountId: string | null;
  accountLocked: boolean;
  setAccountId: (accountId: string | null) => void;
  linkError: string | null;
  owner: CoupangCatalogCollectionRun | null;
  chainOverallState: CoupangCatalogCollectionRun['overallState'] | null;
  browser: CoupangCatalogBrowserStatus | null;
  ownerLoading: boolean;
  ownerError: unknown;
  actionError: string | null;
  cancelError: string | null;
  isCancelling: boolean;
  cancel: () => Promise<void>;
  openAttention: () => Promise<void>;
}

export function useReadinessCollection({
  refetchReadiness,
  catalogEnabled = false,
  catalogLink: catalogLinkOverride,
}: UseReadinessCollectionOptions) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
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
    () => validCatalogLink?.channelAccountId ??
      readActiveCoupangCatalogAttemptForStage('basics')?.channelAccountId ??
      readActiveCoupangCatalogAttempt()?.channelAccountId ?? null,
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
    if (validCatalogLink) {
      setCatalogAccountId(validCatalogLink.channelAccountId);
      return;
    }
    if (catalogLinkOverride !== undefined) {
      const storedAccountId = readActiveCoupangCatalogAttemptForStage('basics')?.channelAccountId ??
        readActiveCoupangCatalogAttempt()?.channelAccountId ?? null;
      setCatalogAccountId(storedAccountId);
      return;
    }
    if (catalogAccountId && catalogAccounts.some((account) => account.id === catalogAccountId)) return;
    const preferred = catalogAccounts.find((account) => account.isPrimary === true) ?? catalogAccounts[0];
    if (preferred) setCatalogAccountId(preferred.id);
  }, [catalogAccountId, catalogAccounts, catalogLinkKey, catalogLinkOverride, validCatalogLink]);
  const catalogInputReady = !validCatalogLink ||
    (catalogAccountsQuery.isFetched && linkedAccountKnown);
  const catalogImportAccountId = validCatalogLink && linkedAccountKnown
    ? validCatalogLink.channelAccountId
    : validCatalogLink
      ? null
      : catalogAccountId;
  const catalogImport = useCoupangCatalogImport(
    catalogImportAccountId,
    validCatalogLink && linkedAccountKnown ? validCatalogLink.attemptId : null,
    validCatalogLink?.stage ?? 'basics',
    {
      enabled: catalogEnabled && catalogInputReady && !malformedCatalogLink,
      suppressStoredAttempt: Boolean(catalogLink),
      onSettled: async (owner, explicitlyStarted) => {
        setPendingKey((current) => current === 'coupang_products' ? null : current);
        if (explicitlyStarted) {
          const overallState = owner.overallState ?? owner.state;
          if (overallState === 'FAILED') {
            toast.error(
              `${owner.error?.message ?? '쿠팡 상품 수집에 실패했습니다.'} · 이전 정상 데이터는 유지됩니다.`,
            );
          } else {
            toast.success('쿠팡 전체 상품 수집 완료');
          }
        }
        await refetchReadiness();
      },
    },
  );
  useEffect(() => {
    const owner = catalogImport.chainStatus ?? catalogImport.serverStatus;
    const overallState = catalogImport.chainOverallState;
    if (catalogImport.isStarting || overallState === 'RUNNING') {
      setPendingKey((current) =>
        current === null || current === 'coupang_products' ? 'coupang_products' : current,
      );
    } else if (overallState && owner) {
      setPendingKey((current) => current === 'coupang_products' ? null : current);
    }
  }, [
    catalogImport.chainOverallState,
    catalogImport.chainStatus?.currentAttemptId,
    catalogImport.chainStatus?.currentStage,
    catalogImport.isStarting,
    catalogImport.serverStatus?.attemptId,
    catalogImport.serverStatus?.currentAttemptId,
    catalogImport.serverStatus?.currentStage,
    catalogImport.serverStatus?.overallState,
    catalogImport.serverStatus?.state,
  ]);
  useEffect(() => {
    if (!catalogImport.readError) return;
    toast.error('서버의 쿠팡 상품 수집 결과를 확인하지 못했습니다.');
  }, [catalogImport.readError]);

  const handleCollect = async (
    check: ReadinessCheck,
  ) => {
    if (check.key === 'coupang_products') {
      if (catalogLinkError) {
        toast.error(catalogLinkError);
        return;
      }
      if (validCatalogLink && !linkedAccountKnown) {
        toast.error('연결된 쿠팡 계정을 확인하는 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      setPendingKey(check.key);
      try {
        let accounts = catalogAccounts;
        if (accounts.length === 0) {
          const refreshed = await catalogAccountsQuery.refetch();
          accounts = (Array.isArray(refreshed.data) ? refreshed.data : [])
            .filter((account) => account.channel === 'coupang');
        }
        const account = validCatalogLink
          ? accounts.find((candidate) => candidate.id === validCatalogLink.channelAccountId)
          : accounts.find((candidate) => candidate.id === catalogAccountId) ??
          accounts.find((candidate) => candidate.isPrimary === true) ??
          accounts[0];
        if (!account) throw new Error('활성 쿠팡 채널 계정을 찾을 수 없습니다.');
        setCatalogAccountId(account.id);
        await catalogImport.start(account.id);
        toast.info('쿠팡 상품 받기를 시작했습니다.');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '쿠팡 상품 받기 시작 실패');
        setPendingKey(null);
      }
      return;
    }

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
    owner: catalogImport.chainStatus ?? catalogImport.serverStatus,
    chainOverallState: catalogImport.chainOverallState,
    browser: catalogImport.extensionStatus,
    ownerLoading: catalogImport.statusLoading,
    ownerError: catalogImport.readError,
    actionError: catalogImport.startError instanceof Error ? catalogImport.startError.message : null,
    cancelError: catalogImport.cancelError instanceof Error ? catalogImport.cancelError.message : null,
    isCancelling: catalogImport.isStopping,
    cancel: async () => {
      await catalogImport.cancel();
      toast.info('쿠팡 상품 받기를 중단했습니다.');
    },
    openAttention: async () => { await catalogImport.openAttention(); },
  };

  return { pendingKey, handleCollect, catalog };
}
