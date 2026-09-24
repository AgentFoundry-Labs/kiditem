'use client';

import { useQuery } from '@tanstack/react-query';
import type { RegistrationAccountState, SalesProductRegistrationState } from '@kiditem/shared/sales-product';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { isLiveRegistrationState } from './registration-account-state';

/** 살아 있는 실행(준비 중 · 전송 중 · 확인 대기)이 있는 동안만 이 간격으로 다시 읽는다. */
export const REGISTRATION_STATE_POLL_MS = 5_000;

const NO_ACCOUNTS: readonly RegistrationAccountState[] = [];

export function registrationStatePollInterval(data: SalesProductRegistrationState | undefined): number | false {
  return data?.accounts.some((account) => isLiveRegistrationState(account.state))
    ? REGISTRATION_STATE_POLL_MS
    : false;
}

/**
 * 판매상품 하나의 몰 계정별 등록 상태(KID-320). 화면마다 실행 이력을 따로 읽고 폴링하지 않는다 —
 * 이 한 경로를, 살아 있는 계정이 있을 때만 5초마다 다시 읽는다(탭당 최대 12회/분).
 */
export function useRegistrationState(salesProductId: string | null | undefined) {
  const query = useQuery({
    queryKey: salesProductKeys.registrationState(salesProductId ?? ''),
    queryFn: () => salesProductApi.registrationState(salesProductId as string),
    enabled: Boolean(salesProductId),
    refetchInterval: (current) => registrationStatePollInterval(current.state.data),
  });
  return {
    accounts: query.data?.accounts ?? NO_ACCOUNTS,
    isLoading: query.isLoading,
    error: query.error,
  };
}
