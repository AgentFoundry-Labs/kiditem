'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useSellpiaInventoryFreshness } from '@/hooks/useSellpiaInventoryFreshness';
// 부서 버튼 인라인 실행 — 각 페이지의 기존 수집 로직을 그대로 재사용한다(중복 구현 금지).
import { useOrderCollectionSessionControls } from '@/app/(orders)/order-collection/hooks/use-order-collection-session-controls';
import { orderMallAccountApi } from '@/app/(orders)/order-collection/lib/order-mall-account-api';
import { createBrowserMallCollector } from '@/app/(orders)/order-collection/lib/browser-mall-collection';
import { isBrowserCollectableMall } from '@/app/(orders)/order-collection/lib/order-collection-page-model';
import { runWithConcurrency } from '@/app/(orders)/order-collection/lib/order-collection-concurrency';
import { saveGeneratedOrderFile } from '@/app/(orders)/order-collection/lib/order-generated-file-store';
import type { OrderCollectionMallAccount } from '@/app/(orders)/order-collection/lib/order-mall-account-api';

export type { OrderCollectionMallAccount };
import { collectCoupangShipmentDraftsViaExtension } from '@/app/(inventory)/coupang-shipments/lib/coupang-shipment-extension';
import { mergeCoupangShipmentFiles } from '@/app/(inventory)/coupang-shipments/lib/coupang-shipment-files';
import { saveCoupangShipmentFiles } from '@/app/(inventory)/coupang-shipments/lib/coupang-shipment-store';

const COLLECT_ALL_CONCURRENCY = 4;

function kstTodayYmd(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export interface OrderCollectResult {
  total: number;
  success: number;
  /** 재수집 대상이 되도록 실패한 몰 계정을 그대로 반환한다. */
  failedAccounts: OrderCollectionMallAccount[];
}

export interface ShipmentCollectResult {
  date: string;
  shipments: number;
  files: number;
  failed: number;
}

/**
 * 대시보드 부서 버튼의 인라인 실행 액션. 주문 전체수집·쿠팡 쉽먼트는 각 페이지의
 * 수집/병합 로직(확장 브릿지 + 세션 컨트롤)을 그대로 재사용한다.
 * ⚠️ 확장(익스텐션)이 있어야 실제 수집이 동작한다.
 */
export function useDepartmentQuickActions() {
  const { data: mallAccounts = [] } = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: orderMallAccountApi.list,
    staleTime: 60_000,
  });
  const sessionControls = useOrderCollectionSessionControls(mallAccounts);
  const freshness = useSellpiaInventoryFreshness({ enabled: true });

  const collectBrowserMall = useMemo(
    () => createBrowserMallCollector({
      mallAccounts,
      rocketChannelAccountId: null,
      // 수집 결과 파일은 서버/스토어에 영속화만 한다(대시보드엔 파일 목록 UI 없음).
      addGeneratedFile: (item) => {
        void saveGeneratedOrderFile(item).catch(() => undefined);
      },
      setPreviewId: () => undefined,
    }),
    [mallAccounts],
  );

  // 여러 몰 계정을 동시성 풀로 수집하고, 실패한 계정 목록을 반환한다.
  const collectAccounts = useCallback(
    async (accounts: OrderCollectionMallAccount[]): Promise<OrderCollectionMallAccount[]> => {
      const failed: OrderCollectionMallAccount[] = [];
      await runWithConcurrency(accounts, COLLECT_ALL_CONCURRENCY, async (account) => {
        const run = (await sessionControls.prepareRun(account)) ?? undefined;
        if (!run) {
          failed.push(account);
          return;
        }
        try {
          await collectBrowserMall(account, run);
          await sessionControls.finalizeRun(run, 'succeeded', `${account.name} 수집 완료`);
        } catch {
          await sessionControls
            .finalizeRun(run, 'failed', `${account.name} 수집 실패`)
            .catch(() => undefined);
          failed.push(account);
        } finally {
          sessionControls.releaseRun(account.key, run.runId);
        }
      });
      return failed;
    },
    [sessionControls, collectBrowserMall],
  );

  // 소싱 시장분석 — 서버가 네이버·1688·쇼츠 트렌드를 수집한다.
  const collectTrend = useCallback(async () => {
    await apiClient.post('/api/sourcing/trend/collect', {});
  }, []);

  // 재고 분석 업데이트 / 셀피아 동기화 — 공용 조정자에 현재고·소진 재수집 요청.
  const requestInventoryRefresh = useCallback(async () => {
    await freshness.requestRefresh('manual_request');
  }, [freshness]);

  // 주문 전체수집 — 활성·자동수집 가능 몰을 전부 수집. 실패 계정을 반환한다.
  const collectAllOrders = useCallback(async (): Promise<OrderCollectResult> => {
    const targets = mallAccounts.filter(
      (account) => account.enabled && isBrowserCollectableMall(account),
    );
    if (targets.length === 0) {
      throw new Error('현재 자동 수집 가능한 몰 계정이 없습니다.');
    }
    const failedAccounts = await collectAccounts(targets);
    return { total: targets.length, success: targets.length - failedAccounts.length, failedAccounts };
  }, [mallAccounts, collectAccounts]);

  // 실패한 몰만 재수집. 여전히 실패한 계정을 반환한다.
  const retryOrders = useCallback(
    async (accounts: OrderCollectionMallAccount[]): Promise<OrderCollectResult> => {
      if (accounts.length === 0) return { total: 0, success: 0, failedAccounts: [] };
      const failedAccounts = await collectAccounts(accounts);
      return {
        total: accounts.length,
        success: accounts.length - failedAccounts.length,
        failedAccounts,
      };
    },
    [collectAccounts],
  );

  // 출고 금일 쿠팡 쉽먼트 — 오늘 발송일 기준: 쿠팡 수집 → 병합 → 파일 저장.
  const collectShipmentToday = useCallback(async (): Promise<ShipmentCollectResult> => {
    const date = kstTodayYmd();
    const { shipments, failed, drafts } = await collectCoupangShipmentDraftsViaExtension(
      date,
      () => undefined,
    );
    const results = await mergeCoupangShipmentFiles(drafts);
    const mergedFiles = results.flatMap((result) => result.files);
    await saveCoupangShipmentFiles(mergedFiles);
    return {
      date,
      shipments: shipments.length,
      files: mergedFiles.length,
      failed: failed.length,
    };
  }, []);

  return {
    collectTrend,
    requestInventoryRefresh,
    collectAllOrders,
    retryOrders,
    collectShipmentToday,
  };
}
