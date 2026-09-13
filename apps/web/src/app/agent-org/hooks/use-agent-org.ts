'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardAdSummarySchema, DashboardSalesSummarySchema } from '@kiditem/shared/dashboard';
import type { PanelRunItem } from '@kiditem/shared/panel';
import { orderMallAccountApi } from '@/app/(orders)/order-collection/lib/order-mall-account-api';
import { usePanelStore } from '@/components/panel/lib/panel-store';
import { apiClient } from '@/lib/api-client';
import {
  getMallLoginBlocks,
  getMallLoginBlocksServerSnapshot,
  subscribeMallLoginBlocks,
} from '@/lib/mall-login-block';
import { mallOperationOutcomesApi } from '@/lib/mall-operation-outcomes-api';
import { operationsApi } from '@/lib/operations-api';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import type { PipeBusiness } from '../components/PipeBottomDashboard';
import { buildPipeSnapshot, type PipeSnapshot } from '../lib/pipe-model';
import { useConfirmReport, type PipeConfirmChannel } from './use-confirm-report';

/** 몰 작업 기억은 오늘 것만 본다 — 지난주 로그인 실패로 오늘 화면을 빨갛게 칠하지 않는다. */
const OUTCOME_DAYS = 1;
/** 상대 시간("12분 전")을 다시 그리는 간격. */
const CLOCK_MS = 30_000;
/** 하단 실시간 작업에 올리는 수. */
const RUN_LIMIT = 15;

/**
 * Agent Org 가 읽는 기록 넷을 모은다.
 *
 * 사장님 컨펌만 새 읽기(컨펌 보고 상태)를 쓰고, 그 밖에는 새 API 도 새 실시간 스트림도 만들지 않는다. 실행 기록 · 몰 작업 기억 · 셀피아 신선도는
 * 다른 화면과 같은 쿼리 키를 써서 캐시를 나눠 쓰고, 알림은 앱 레이아웃이 이미 열어 둔 알림
 * 스트림 저장소를 읽는다 — 여기서 스트림을 또 열면 브라우저 연결 자리를 먹어 다른 요청이
 * 시간 초과로 끊긴다.
 */
export function useAgentOrg(): {
  snapshot: PipeSnapshot;
  connection: string;
  now: number;
  confirm: PipeConfirmChannel;
  business: PipeBusiness;
  runs: PanelRunItem[];
  refresh: () => void;
} {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const runs = useQuery({
    queryKey: queryKeys.operations.runs(),
    queryFn: operationsApi.listRuns,
    refetchInterval: 30_000,
    meta: { suppressGlobalErrorToast: true },
  });
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

  const byId = usePanelStore((state) => state.byId);
  const connection = usePanelStore((state) => state.connectionStatus);
  const loginBlocks = useSyncExternalStore(
    subscribeMallLoginBlocks,
    getMallLoginBlocks,
    getMallLoginBlocksServerSnapshot,
  );

  const snapshot = useMemo(
    () =>
      buildPipeSnapshot({
        now,
        runs: { data: runs.data?.items ?? null, failed: runs.isError },
        outcomes: { data: outcomes.data?.rows ?? null, failed: outcomes.isError },
        malls: { data: Array.isArray(malls.data) ? malls.data : null, failed: malls.isError },
        freshness: { data: freshness.data ?? null, failed: freshness.isError },
        confirm: {
          data: confirm.status?.candidates
            ? { ...confirm.status.candidates, lastReportAt: confirm.status.lastReport?.sentAt ?? null }
            : null,
          failed: confirm.failed,
        },
        panelItems: Object.values(byId),
        loginBlocks,
      }),
    [now, runs.data, runs.isError, outcomes.data, outcomes.isError, malls.data, malls.isError, freshness.data, freshness.isError, confirm.status, confirm.failed, byId, loginBlocks],
  );

  const business = useMemo<PipeBusiness>(
    () => ({ sales: sales.data ?? null, ad: ad.data ?? null, salesFailed: sales.isError, adFailed: ad.isError }),
    [sales.data, sales.isError, ad.data, ad.isError],
  );

  const panelRuns = useMemo(
    () =>
      Object.values(byId)
        .filter((item): item is PanelRunItem => item.kind === 'run')
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, RUN_LIMIT),
    [byId],
  );

  const refresh = useCallback(() => {
    setNow(Date.now());
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.runs() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.mallOperationOutcomes.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.freshness() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.salesBaseline() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.adBaseline() }),
    ]);
  }, [queryClient]);

  return { snapshot, connection, now, confirm, business, runs: panelRuns, refresh };
}
