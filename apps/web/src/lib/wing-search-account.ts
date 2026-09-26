'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ChannelAccountListItemSchema, type ChannelAccountListItem } from '@kiditem/shared/channel-account';
import { apiClient } from './api-client';
import { queryKeys } from './query-keys';

// Wing 검색 실행 kind(소싱 `sourcing.wing_catalog`, 광고 `advertising.wing_*`)가 scope에 싣는 계정. 잠금 `account:<id>`가
// 그 계정의 Wing 로그인 하나를 지킨다. 계정 선택 UI는 없다 — 조직의 대표 쿠팡 계정을 쓴다.

export const WING_ACCOUNT_MISSING = '쿠팡 윙 계정을 먼저 연결해 주세요.';
export const WING_ACCOUNTS_LOADING = '쿠팡 계정 목록을 불러오는 중입니다. 잠시 후 다시 시작해 주세요.';
export const WING_ACCOUNTS_UNAVAILABLE = '쿠팡 계정 목록을 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.';

export type WingSearchAccount = Pick<ChannelAccountListItem, 'id' | 'name'>;

/** 계정 목록 읽기의 상태. 읽기 전·실패엔 시작을 보내지 않고 그 까닭을 따로 말한다. */
export type WingAccountRead =
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'failed' }>
  | Readonly<{ state: 'read'; account: WingSearchAccount | null }>;

/**
 * Wing 검색에 쓸 계정: 조직의 쿠팡 계정 중 대표 계정, 없으면 이름순 첫 계정(카탈로그 동기화·상품평과 같은 규칙).
 */
export function pickWingSearchAccount(accounts: readonly ChannelAccountListItem[] | undefined): WingSearchAccount | null {
  const coupang = (accounts ?? []).filter((account) => account.channel === 'coupang');
  const [first] = [...coupang].sort((left, right) =>
    Number(right.isPrimary) - Number(left.isPrimary) || left.name.localeCompare(right.name, 'ko'));
  return first ? { id: first.id, name: first.name } : null;
}

/** 읽기 상태 → 계정 id. 읽기 전·실패·계정 없음이면 운영자 문장으로 던진다(시작을 보내지 않는다). */
export function requireWingSearchAccount(read: WingAccountRead): WingSearchAccount {
  if (read.state === 'loading') throw new Error(WING_ACCOUNTS_LOADING);
  if (read.state === 'failed') throw new Error(WING_ACCOUNTS_UNAVAILABLE);
  if (!read.account) throw new Error(WING_ACCOUNT_MISSING);
  return read.account;
}

const ChannelAccountListSchema = z.array(ChannelAccountListItemSchema);

/** 조직의 켜진 채널 계정을 읽어 Wing 검색 계정을 고른다. 돌려주는 객체는 고른 계정이 바뀔 때만 바뀐다(어댑터 메모이즈용). */
export function useWingSearchAccountRead(): WingAccountRead {
  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => apiClient.getParsed('/api/channels/accounts', ChannelAccountListSchema),
  });
  const state = accountsQuery.data !== undefined ? 'read' : accountsQuery.isError ? 'failed' : 'loading';
  const account = pickWingSearchAccount(accountsQuery.data);
  const id = account?.id ?? null;
  const name = account?.name ?? null;
  return useMemo<WingAccountRead>(
    () => (state === 'read' ? { state, account: id ? { id, name: name ?? '' } : null } : { state }),
    [state, id, name],
  );
}
