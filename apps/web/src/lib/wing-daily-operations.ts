'use client';

import { z } from 'zod';
import { ChannelAccountListItemSchema } from '@kiditem/shared/channel-account';
import { apiClient } from '@/lib/api-client';

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
