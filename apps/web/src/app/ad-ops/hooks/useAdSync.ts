'use client';

// 광고동기화 실행 훅 — 운영중 캠페인 자동 순회 + 어제 단일일자 일별 적재.
// AdSyncButton(헤더 단독 버튼) 과 ReadinessModal 의 인라인 row 가 공유.

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  cancelOperationAlert,
  failOperationAlert,
  progressOperationAlert,
  startOperationAlert,
  succeedOperationAlert,
} from '@/lib/operation-alerts';
import {
  classifyBatchScrapeStatus,
  summarizeBatchScrapeProgress,
} from '@/lib/operation-alert-lifecycle';

// One operation alert per organization at a time — re-clicking the button
// upserts the same row instead of stacking duplicate panel entries. Concurrent
// runs across browser tabs collapse onto the same `(organizationId, ad-sync)`
// row by the server-side partial unique index.
const AD_SYNC_OPERATION_KEY = 'ad-sync';
const AD_SYNC_HREF = '/ad-ops';

const SWEEP_URL = 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
type ExtensionMessageResponse = {
  success?: boolean;
  error?: string;
  status?: 'starting' | 'running' | 'done' | 'error' | 'idle' | 'cancelled';
  cancelled?: boolean;
  total?: number;
  current?: number;
  completed?: number;
  failed?: number;
  currentLabel?: string;
  runId?: string;
  startedAt?: number;
  endedAt?: number;
};

interface BatchScrapeStatus {
  status?: 'starting' | 'running' | 'done' | 'error' | 'idle' | 'cancelled';
  total?: number;
  current?: number;
  completed?: number;
  failed?: number;
  currentLabel?: string;
  runId?: string;
  startedAt?: number;
  endedAt?: number;
  cancelled?: boolean;
}

interface UseAdSyncOptions {
  onComplete?: () => void;
}

export function useAdSync({ onComplete }: UseAdSyncOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<BatchScrapeStatus | null>(null);
  const cancelRef = useRef<(() => Promise<void>) | null>(null);
  const queryClient = useQueryClient();

  const cancel = useCallback(async () => {
    if (!cancelRef.current) return;
    await cancelRef.current();
  }, []);

  const run = async () => {
    const runId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const runStartedAt = Date.now();
    let sawCurrentRun = false;
    let alertStarted = false;
    setLoading(true);
    setStatus({ status: 'starting', runId, total: 1, current: 0, completed: 0, failed: 0 });
    try {
      const eid = await detectExtensionId();
      if (!eid) {
        // No extension — fall back to opening the ad center directly. There
        // is no tracked operation, so do not create an alert (it would leak
        // as a stuck "running" row).
        window.open(SWEEP_URL, '_blank', 'noopener,noreferrer');
        toast.warning('익스텐션 미연결 — 새 탭으로 광고센터를 엽니다', {
          description:
            'chrome://extensions 에서 KIDITEM 익스텐션 등록 후 다시 시도하면 자동 실행됩니다.',
          duration: 8000,
        });
        return;
      }

      const alert = await startOperationAlert({
        operationKey: AD_SYNC_OPERATION_KEY,
        type: 'ad_sync',
        title: '광고 동기화',
        message: '운영중 캠페인을 자동 순회하며 캠페인별 상품 데이터를 수집합니다.',
        sourceType: 'ad_extension_run',
        sourceId: runId,
        href: AD_SYNC_HREF,
        metadata: { runId },
      });
      alertStarted = !!alert;

      cancelRef.current = async () => {
        await sendToExtension<ExtensionMessageResponse>(eid, { action: 'cancelBatchScrape', runId });
        setStatus((prev) => ({ ...(prev ?? {}), runId, status: 'cancelled', cancelled: true }));
        toast.info('광고 동기화 중단 요청을 보냈습니다');
        if (alertStarted) {
          void cancelOperationAlert(AD_SYNC_OPERATION_KEY, {
            message: '사용자가 광고 동기화를 중단했습니다',
            metadata: { runId },
          });
        }
      };

      const startResp = await sendToExtension<ExtensionMessageResponse>(eid, {
        action: 'scrapeTargets',
        runId,
        urls: [{ id: 'ad-sync', url: SWEEP_URL, label: '광고동기화 (운영중 캠페인 자동 수집)' }],
      });
      if (startResp?.success === false) {
        throw new Error(startResp.error ?? '익스텐션 동기화 시작 실패');
      }

      toast.info('운영중 캠페인 자동 수집 시작 — 새 탭에서 처리됩니다', {
        duration: 6000,
        action: {
          label: '중단',
          onClick: () => {
            void cancelRef.current?.();
          },
        },
      });

      await new Promise<void>((resolve) => {
        const start = Date.now();
        const maxMs = 5 * 60_000;
        const startGraceMs = 15_000;
        const tick = async () => {
          try {
            const nextStatus = await sendToExtension<ExtensionMessageResponse>(eid, {
              action: 'getBatchScrapeStatus',
              runId,
            });
            setStatus(nextStatus as BatchScrapeStatus);
            const statusStartedAt = nextStatus?.startedAt ?? 0;
            const isCurrentRun =
              nextStatus?.runId === runId ||
              (!nextStatus?.runId && statusStartedAt >= runStartedAt - 1000);

            if (isCurrentRun) sawCurrentRun = true;

            // 확장이 storage 에 running 상태를 쓰기 전이면 idle/지난 done 이 올 수 있다.
            // 현재 run 을 한 번도 못 봤다면 시작 유예 시간 동안 계속 기다린다.
            if (!isCurrentRun && !sawCurrentRun && Date.now() - start < startGraceMs) {
              setTimeout(tick, 1000);
              return;
            }

            if (!isCurrentRun && !sawCurrentRun) {
              toast.warning('광고 동기화 시작 상태를 확인하지 못했습니다', {
                description: '광고센터 탭이 열렸는지 확인해주세요.',
              });
              if (alertStarted) {
                void failOperationAlert(AD_SYNC_OPERATION_KEY, {
                  message: '광고 동기화 시작 상태를 확인하지 못했습니다',
                  metadata: { runId },
                });
              }
              resolve();
              return;
            }

            if (
              isCurrentRun &&
              (nextStatus?.status === 'done' ||
                nextStatus?.status === 'error' ||
                nextStatus?.status === 'cancelled' ||
                nextStatus?.status === 'idle')
            ) {
              const summary = summarizeBatchScrapeProgress(nextStatus, nextStatus?.total ?? 1);
              const ok = summary.ok;
              const fail = summary.fail;
              const terminal = classifyBatchScrapeStatus(nextStatus);
              if (terminal === 'cancelled') {
                toast.info(`광고 동기화 중단 — 성공 ${ok} / 실패 ${fail}`);
                if (alertStarted) {
                  void cancelOperationAlert(AD_SYNC_OPERATION_KEY, {
                    message: `광고 동기화 중단됨 (성공 ${ok} / 실패 ${fail})`,
                    metadata: { runId, ok, fail },
                  });
                }
              } else if (terminal === 'failed') {
                toast.error('광고 동기화 실패');
                if (alertStarted) {
                  void failOperationAlert(AD_SYNC_OPERATION_KEY, {
                    message: '광고 동기화 실패',
                    metadata: { runId, ok, fail },
                  });
                }
              } else if (terminal === 'warning') {
                toast.warning(`광고 동기화 종료 — 성공 ${ok} / 실패 ${fail}`);
                if (alertStarted) {
                  void succeedOperationAlert(AD_SYNC_OPERATION_KEY, {
                    severity: 'warning',
                    message: `광고 동기화 일부 실패 (성공 ${ok} / 실패 ${fail})`,
                    metadata: { runId, ok, fail },
                  });
                }
              } else if (terminal === 'succeeded') {
                toast.success('광고 동기화 완료');
                if (alertStarted) {
                  void succeedOperationAlert(AD_SYNC_OPERATION_KEY, {
                    message: `광고 동기화 완료 (캠페인 ${ok}건)`,
                    metadata: { runId, ok, fail },
                  });
                }
              }
              resolve();
              return;
            }
            if (isCurrentRun) {
              const summary = summarizeBatchScrapeProgress(nextStatus, nextStatus?.total ?? 1);
              if (alertStarted) {
                void progressOperationAlert(AD_SYNC_OPERATION_KEY, {
                  progress: summary.progress,
                  message: `광고 동기화 진행 중 (${summary.ok + summary.fail}/${summary.total})`,
                  metadata: {
                    runId,
                    ok: summary.ok,
                    fail: summary.fail,
                    total: summary.total,
                  },
                });
              }
            }
            if (Date.now() - start > maxMs) {
              toast.warning('광고 동기화 타임아웃 — 백그라운드에서 계속 진행 중일 수 있습니다');
              if (alertStarted) {
                void failOperationAlert(AD_SYNC_OPERATION_KEY, {
                  message: '광고 동기화 타임아웃 — 백그라운드에서 진행 중일 수 있음',
                  metadata: { runId, timeout: true },
                });
              }
              resolve();
              return;
            }
            setTimeout(tick, 3000);
          } catch (err) {
            const message = err instanceof Error ? err.message : '광고 동기화 상태 확인 실패';
            if (alertStarted) {
              void failOperationAlert(AD_SYNC_OPERATION_KEY, {
                message,
                metadata: { runId, error: message },
              });
            }
            resolve();
          }
        };
        tick();
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: ['traffic'] });
      queryClient.invalidateQueries({ queryKey: ['readiness'] });
      onComplete?.();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '광고 동기화 실패';
      toast.error(errorMessage);
      if (alertStarted) {
        void failOperationAlert(AD_SYNC_OPERATION_KEY, {
          message: errorMessage,
          metadata: { runId, error: errorMessage },
        });
      }
    } finally {
      cancelRef.current = null;
      setLoading(false);
    }
  };

  return { loading, run, cancel, status };
}
