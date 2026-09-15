'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AlertItem } from '@kiditem/shared/alerts';
import { DashboardAdSummarySchema, DashboardSalesSummarySchema } from '@kiditem/shared/dashboard';
import { orderMallAccountApi } from '@/app/(orders)/order-collection/lib/order-mall-account-api';
import { useAlertsQuery } from '@/lib/alerts-api';
import { apiClient } from '@/lib/api-client';
import {
  getMallLoginBlocks,
  getMallLoginBlocksServerSnapshot,
  subscribeMallLoginBlocks,
} from '@/lib/mall-login-block';
import { mallOperationOutcomesApi } from '@/lib/mall-operation-outcomes-api';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import type { PipeBusiness } from '../components/PipeBottomDashboard';
import { buildPipeSnapshot, type PipeSnapshot } from '../lib/pipe-model';
import { useConfirmReport, type PipeConfirmChannel } from './use-confirm-report';

/** 관찰 기록은 오늘 것만 본다 — 지난주 로그인 실패로 오늘 화면을 빨갛게 칠하지 않는다. */
const OUTCOME_DAYS = 1;
/** 상대 시간("12분 전")을 다시 그리는 간격. */
const CLOCK_MS = 30_000;
/** 하단 열린 알림에 올리는 수. */
const OPEN_ALERT_LIMIT = 15;
const EMPTY_ALERTS: AlertItem[] = [];

/**
 * Agent Org 가 읽는 기록을 모은다.
 *
 * 새 실시간 스트림을 만들지 않는다. 알림은 앱 전역과 같은 알림 쿼리(10초 폴링)를, 몰 작업
 * 관찰 기록 · 셀피아 신선도 · 매출 · 광고는 다른 화면과 같은 쿼리 키를 써서 캐시를 나눠 쓴다.
 * 새로 읽는 것은 사장님 컨펌 보고 상태 하나다.
 */
export function useAgentOrg(): {
  snapshot: PipeSnapshot;
  connection: string;
  now: number;
  confirm: PipeConfirmChannel;
  business: PipeBusiness;
  openAlerts: AlertItem[];
  refresh: () => void;
} {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const alerts = useAlertsQuery();
  const outcomes = useQuery({
    queryKey: queryKeys.mallOperationOutcomes.summary(OUTCOME_DAYS),
    queryFn: () => mallOperationOutcomesApi.summary(OUTCOME_DAYS),
    refetchInterval: 60_000,
    meta: { suppressGlobalErrorToast: true },
  });
  const malls = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: orderMallAccountApi.list,
    staleTime: 5 * 60_000,
    meta: { suppressGlobalErrorToast: true },
  });
  const freshness = useQuery({
    queryKey: queryKeys.inventory.freshness(),
    queryFn: sellpiaInventoryFreshnessApi.getState,
    refetchInterval: 60_000,
    meta: { suppressGlobalErrorToast: true },
  });

  // 하단 매출 · 광고 — 대시보드와 같은 키 · 같은 스키마로 캐시를 나눠 쓴다.
  const sales = useQuery({
    queryKey: queryKeys.dashboard.salesBaseline(),
    queryFn: () => apiClient.getParsed('/api/dashboard/sales', DashboardSalesSummarySchema),
    refetchInterval: 60_000,
    meta: { suppressGlobalErrorToast: true },
  });
  const ad = useQuery({
    queryKey: queryKeys.dashboard.adBaseline(),
    queryFn: () => apiClient.getParsed('/api/dashboard/ad', DashboardAdSummarySchema),
    refetchInterval: 60_000,
    meta: { suppressGlobalErrorToast: true },
  });

  const confirm = useConfirmReport();

  const loginBlocks = useSyncExternalStore(
    subscribeMallLoginBlocks,
    getMallLoginBlocks,
    getMallLoginBlocksServerSnapshot,
  );

  // 스트림이 아니라 폴링이다. 마지막으로 받아 왔으면 살아 있고, 못 받았으면 끊겼다.
  const connection = alerts.isError ? 'disconnected' : alerts.isSuccess ? 'connected' : 'connecting';
  const alertRows = alerts.data ?? EMPTY_ALERTS;

  const snapshot = useMemo(
    () =>
      buildPipeSnapshot({
        now,
        alerts: { data: alerts.data ?? null, failed: alerts.isError },
        outcomes: { data: outcomes.data?.rows ?? null, failed: outcomes.isError },
        malls: { data: Array.isArray(malls.data) ? malls.data : null, failed: malls.isError },
        freshness: { data: freshness.data ?? null, failed: freshness.isError },
        confirm: {
          data: confirm.status?.candidates
            ? { ...confirm.status.candidates, lastReportAt: confirm.status.lastReport?.sentAt ?? null }
            : null,
          failed: confirm.failed,
        },
        loginBlocks,
      }),
    [now, alerts.data, alerts.isError, outcomes.data, outcomes.isError, malls.data, malls.isError, freshness.data, freshness.isError, confirm.status, confirm.failed, loginBlocks],
  );

  const business = useMemo<PipeBusiness>(
    () => ({ sales: sales.data ?? null, ad: ad.data ?? null, salesFailed: sales.isError, adFailed: ad.isError }),
    [sales.data, sales.isError, ad.data, ad.isError],
  );

  const openAlerts = useMemo(
    () =>
      alertRows
        .filter((alert) => alert.status === 'OPEN')
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, OPEN_ALERT_LIMIT),
    [alertRows],
  );

  const refresh = useCallback(() => {
    setNow(Date.now());
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.mallOperationOutcomes.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.freshness() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.salesBaseline() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.adBaseline() }),
    ]);
  }, [queryClient]);

  return { snapshot, connection, now, confirm, business, openAlerts, refresh };
}
