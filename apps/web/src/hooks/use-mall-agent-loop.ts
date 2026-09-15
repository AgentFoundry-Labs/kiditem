'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { orderMallAccountApi } from '@/app/(orders)/order-collection/lib/order-mall-account-api';
import {
  getMallAgentLoopServerState,
  getMallAgentLoopState,
  isWithinAgentBusinessHours,
  markMallAgentLoopFinished,
  markMallAgentLoopStep,
  nextAgentRunAt,
  requestMallAgentLoopRun,
  setMallAgentLoopEnabled,
  setMallAgentLoopInterval,
  subscribeMallAgentLoop,
  type MallAgentLoopState,
} from '@/lib/mall-agent-loop';
import { getMallLoginBlocks } from '@/lib/mall-login-block';
import { sweepMallSessions } from '@/lib/mall-session-probe';
import { formatNumber } from '@/lib/utils';
import { usePersistedAllMarketplaceOrderCollection } from './useAllMarketplaceOrderCollection';
import { useRocketChannelAccounts } from './useRocketChannelAccounts';

/** 화면이 루프 상태를 읽고 켜고 끄는 곳. */
export function useMallAgentLoop(): MallAgentLoopState & {
  setEnabled: (enabled: boolean) => void;
  setIntervalMin: (minutes: number) => void;
  runNow: () => void;
} {
  const state = useSyncExternalStore(
    subscribeMallAgentLoop,
    getMallAgentLoopState,
    getMallAgentLoopServerState,
  );
  return {
    ...state,
    setEnabled: setMallAgentLoopEnabled,
    setIntervalMin: setMallAgentLoopInterval,
    runNow: requestMallAgentLoopRun,
  };
}

/** 탭이 여러 개여도 한 탭만 돈다. 잠금을 못 잡으면 이번 바퀴는 건너뛴다. */
async function withSingleRunner<T>(operation: () => Promise<T>): Promise<T | null> {
  if (typeof navigator === 'undefined' || !navigator.locks) return operation();
  return navigator.locks.request(
    'kiditem-mall-agent-loop',
    { ifAvailable: true },
    async (lock) => (lock ? operation() : null),
  );
}

/**
 * 에이전트 자동 운전 러너 — 운영자가 시작한 뒤 이 탭이 열려 있는 동안 한 바퀴씩 돈다.
 *
 * 러너는 운영자가 시작했을 때만 붙는다(`MallAgentLoopProvider`). 붙자마자 한 바퀴를 돌고,
 * 그 뒤로는 끝난 바퀴가 정한 다음 시각마다 돈다. 한 바퀴는 (1) 몰 로그인 상태 조용히 확인 →
 * (2) 업무시간이면 주문수집 전체 실행이다. 로그인 확인은 시간과 상관없이 돌고, 수집은
 * 09~18시에만 돈다. 되돌리기 어려운 일은 하지 않는다 — 셀피아 전송 · 제출 · 삭제는 사람이
 * 그 화면에서 누른다.
 */
export function useMallAgentLoopRunner(): void {
  const { rocketAccounts } = useRocketChannelAccounts();
  const rocketChannelAccountId = rocketAccounts[0]?.id ?? null;
  const { collectAllOrders } = usePersistedAllMarketplaceOrderCollection({ rocketChannelAccountId });
  const state = useMallAgentLoop();
  const { enabled, intervalMin } = state.settings;
  const busyRef = useRef(false);
  const collectRef = useRef(collectAllOrders);
  useEffect(() => {
    collectRef.current = collectAllOrders;
  }, [collectAllOrders]);

  const tick = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const startedAt = Date.now();
    try {
      await withSingleRunner(async () => {
        const parts: string[] = [];
        // 사람이 직접 로그인·인증해야 하는 몰. 이번 바퀴의 수집에서 뺀다.
        const waitingForOperator = new Set<string>();
        markMallAgentLoopStep('login');
        try {
          const accounts = await orderMallAccountApi.list();
          const sweep = await sweepMallSessions(accounts.filter((account) => account.enabled).map((account) => account.key));
          for (const key of sweep.signedOutKeys) waitingForOperator.add(key);
          parts.push(
            sweep.checked === 0
              ? '로그인 확인 못 함'
              : `로그인됨 ${formatNumber(sweep.signedIn)} · 로그인 필요 ${formatNumber(sweep.signedOut)}`,
          );
        } catch {
          parts.push('로그인 확인 실패');
        }
        // 자동 로그인이 막힌 몰도 뺀다 — 사장님이 직접 로그인하실 때까지 들어가지 않는다.
        for (const block of getMallLoginBlocks()) waitingForOperator.add(block.mallKey);

        if (isWithinAgentBusinessHours(Date.now())) {
          markMallAgentLoopStep('orders');
          try {
            await collectRef.current([...waitingForOperator]);
            parts.push(
              waitingForOperator.size > 0
                ? `주문수집 완료 (${formatNumber(waitingForOperator.size)}개 몰은 직접 로그인 필요라 건너뜀)`
                : '주문수집 완료',
            );
          } catch (error) {
            parts.push(error instanceof Error ? `주문수집 멈춤 — ${error.message}` : '주문수집 멈춤');
          }
        } else {
          parts.push('업무시간이 아니라 수집은 건너뜀');
        }
        return parts.join(' · ');
      }).then((summary) => {
        const finishedAt = Date.now();
        markMallAgentLoopFinished(
          summary ?? '다른 탭에서 도는 중이라 건너뜀',
          finishedAt,
          nextAgentRunAt(finishedAt, intervalMin * 60 * 1000),
        );
      });
    } finally {
      busyRef.current = false;
    }
    void startedAt;
  }, [intervalMin]);

  // 운영자가 시작해 러너가 붙은 순간 첫 바퀴를 돈다. 앱을 열었다고 붙지는 않는다.
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);
  useEffect(() => {
    void tickRef.current();
  }, []);

  useEffect(() => {
    if (!enabled || state.nextRunAt === null) return;
    const delay = Math.max(0, state.nextRunAt - Date.now());
    const timer = window.setTimeout(() => {
      void tick();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, state.nextRunAt, tick]);

  // '지금 실행'은 기다리지 않고 바로 한 바퀴.
  const lastRunRequestRef = useRef(state.runRequest);
  useEffect(() => {
    if (state.runRequest === lastRunRequestRef.current) return;
    lastRunRequestRef.current = state.runRequest;
    void tick();
  }, [state.runRequest, tick]);
}
