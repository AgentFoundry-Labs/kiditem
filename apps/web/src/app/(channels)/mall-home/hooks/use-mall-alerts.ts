'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAlertsQuery } from '@/lib/alerts-api';
import {
  getMallLoginBlocks,
  getMallLoginBlocksServerSnapshot,
  subscribeMallLoginBlocks,
} from '@/lib/mall-login-block';
import { queryKeys } from '@/lib/query-keys';
import { orderMallAccountApi } from '@/lib/order-mall-account-api';
import { mallPublishingApi } from '../../_shared/mall-publishing-api';
import { useMallCapabilityRows } from '../../_shared/use-mall-capability-rows';
import {
  derivedMallAlerts,
  mallAlertCounts,
  mallAlertsFrom,
  mallStatusTiles,
} from '../lib/mall-alerts';
import {
  countMallSessions,
  mallSessionStates,
  type LoginNeededCount,
  type MallSessionView,
} from '../lib/mall-session';
import { useMallSessionProbe } from './use-mall-session-probe';

/** 품절 관리 화면과 같은 창이라 캐시를 나눠 쓴다. `total` 은 창 크기와 상관없다. */
const AVAILABILITY_PREVIEW_LIMIT = 100;
/**
 * 쇼핑몰 홈이 읽는 모든 것 — 몰 판정(쇼핑몰 현황과 같은 곳), 몰 알림(전역 알림 쿼리),
 * 지금 상태(품절 후보, 쿠팡 발주확인 대기, 몰 로그인 상태, 자동 로그인이 멈춘 몰),
 * 현재 로그인 확인 결과.
 *
 * 하나를 못 받아도 나머지는 선다. 못 받은 숫자는 `null` 로 두고 알림을 지어내지 않는다.
 * 로그인 상태는 확장이 확인한 몰만 말한다 — 확인하지 못한 몰을 로그인 필요로 세지 않는다.
 */
export function useMallAlerts() {
  const { overviewQuery, overview, totals } = useMallCapabilityRows();
  const alertsQuery = useAlertsQuery();
  const alertsReady = alertsQuery.isSuccess || alertsQuery.isError;

  const availabilityQuery = useQuery({
    queryKey: queryKeys.mallPublishing.availabilityPreview({ limit: String(AVAILABILITY_PREVIEW_LIMIT) }),
    queryFn: () => mallPublishingApi.availabilityPreview(AVAILABILITY_PREVIEW_LIMIT),
  });
  const coupangQuery = useQuery({
    queryKey: queryKeys.coupangDashboard.summary(),
    queryFn: () => mallPublishingApi.coupangDashboardSummary(),
  });
  const channels = overview?.channels ?? null;
  const soldOutTotal = availabilityQuery.data?.total ?? null;
  // 레시피가 없는 옵션은 품절 후보에 오르지 않는다 — 따로 센다.
  const noRecipeCount = availabilityQuery.data?.noRecipeCount ?? null;
  const coupangPendingAccept = coupangQuery.data?.pendingAccept ?? null;
  // 몰 로그인 상태 — 열면 확장이 몰마다 조용히 확인한다(로그인하지 않는다).
  const mallKeys = useMemo(() => channels?.map((channel) => channel.mallKey) ?? null, [channels]);
  // 고정 확인 주소가 없는 몰은 쇼핑몰 계정에 저장된 사이트 주소를 열어 본다.
  const mallAccountsQuery = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: () => orderMallAccountApi.list(),
  });
  const siteUrls = useMemo(
    () => Object.fromEntries(
      (Array.isArray(mallAccountsQuery.data) ? mallAccountsQuery.data : [])
        .map((account) => [account.key, account.siteUrl]),
    ),
    [mallAccountsQuery.data],
  );
  const probe = useMallSessionProbe(
    mallKeys,
    siteUrls,
    mallAccountsQuery.isSuccess || mallAccountsQuery.isError,
  );
  const sessionStates = useMemo(
    () => mallSessionStates(mallKeys ?? [], probe.results, probe.checking),
    [mallKeys, probe.results, probe.checking],
  );
  const signedOut = useMemo(
    () => (channels ?? []).filter((channel) => sessionStates[channel.mallKey] === 'signed_out'),
    [channels, sessionStates],
  );
  // 자동 로그인이 한 번 실패해 멈춘 몰 — 다시 시도하지 않고 사람에게 넘긴다.
  const loginBlocks = useSyncExternalStore(
    subscribeMallLoginBlocks,
    getMallLoginBlocks,
    getMallLoginBlocksServerSnapshot,
  );
  const manualLogin = useMemo(
    () =>
      (channels ?? []).flatMap((channel) => {
        const block = loginBlocks.find((candidate) => candidate.mallKey === channel.mallKey);
        if (!block) return [];
        // 방금 확인해서 로그인돼 있으면 그 차단은 낡은 것이다. '로그인됨'과 '직접 로그인 필요'를
        // 한 카드에 같이 띄우지 않는다 — 지우기(clearMallAutoLoginBlock)가 어떤 이유로 늦거나
        // 건너뛰어도 화면은 확인된 사실을 따른다. 인증 차단은 남긴다(세션이 살아 있어도 몰이
        // 본인확인을 요구하는 상태라 모순이 아니다).
        if (block.kind === 'login' && sessionStates[channel.mallKey] === 'signed_in') return [];
        return [{ mallKey: channel.mallKey, mallName: channel.mallName, kind: block.kind }];
      }),
    [channels, loginBlocks, sessionStates],
  );

  const alerts = useMemo(() => mallAlertsFrom(alertsQuery.data ?? []), [alertsQuery.data]);
  // 열린 몰 알림 — 사람이 읽었어도 원천이 다시 성공할 때까지 열려 있다.
  const openAlertCount = alertsReady ? alerts.filter((alert) => alert.status === 'OPEN').length : null;
  const derived = useMemo(
    () => derivedMallAlerts({ channels, signedOut, manualLogin, soldOutTotal, coupangPendingAccept }),
    [channels, signedOut, manualLogin, soldOutTotal, coupangPendingAccept],
  );
  const tiles = useMemo(
    () =>
      channels ? mallStatusTiles(channels, alerts, derived, sessionStates) : [],
    [channels, alerts, derived, sessionStates],
  );
  const counts = useMemo(() => mallAlertCounts(alerts, derived), [alerts, derived]);
  const noLoginCount = channels ? channels.filter((channel) => !channel.hasCredentials).length : null;
  // 로그인해야 하는 몰 — 세션이 풀렸거나 계정 정보가 없는 몰. 겹치면 한 번. 자동 로그인
  // 차단은 이 브라우저에만 있는 값이라 숫자에 섞지 않는다(알림판과 몰 타일에는 보인다).
  const loginNeeded = useMemo((): LoginNeededCount | null => {
    if (!channels) return null;
    const noCredentials = channels.filter((channel) => !channel.hasCredentials);
    const keys = new Set([...noCredentials, ...signedOut].map((channel) => channel.mallKey));
    const checked = probe.status === 'running' || probe.status === 'done';
    return { total: keys.size, signedOut: checked ? signedOut.length : null, noCredentials: noCredentials.length };
  }, [channels, signedOut, probe.status]);
  const session = useMemo(
    (): MallSessionView => ({
      status: probe.status,
      counts: countMallSessions(sessionStates),
      checkedAt: probe.checkedAt,
      extensionVersion: probe.extensionVersion,
      recheck: probe.recheck,
    }),
    [probe.status, probe.checkedAt, probe.extensionVersion, probe.recheck, sessionStates],
  );

  return {
    overviewQuery,
    overview,
    totals,
    alerts,
    alertsReady,
    openAlertCount,
    derived,
    tiles,
    counts,
    noLoginCount,
    loginNeeded,
    session,
    soldOutTotal,
    noRecipeCount,
    coupangPendingAccept,
  };
}
